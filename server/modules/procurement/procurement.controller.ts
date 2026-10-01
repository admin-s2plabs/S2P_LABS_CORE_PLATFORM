import { Router, type RequestHandler } from "express";
import { z } from "zod";
import * as service from "./procurement.service";
import { logAudit } from "../administration/administration.service";
import {
  upload,
  validateUploadedFile,
  sanitizeFilename,
} from "../_shared/file-upload";
import { uploadFileToAzure } from "../../services/azure-blob.service";
import { getTenantDomain } from "../_shared/db";
import { resolveRequestUser } from "../_shared/auth";
import { rewrapTenantContext } from "../../tenant-context";

const router = Router();

function handleError(res: any, error: any, fallbackMessage: string) {
  if (error?.status) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(fallbackMessage + ":", error);
  res.status(500).json({ error: error?.message || fallbackMessage });
}

function audit(
  req: any,
  auditKey: string,
  auditAction: string,
  auditMessage: string,
  module: string,
) {
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

/** Legacy Spring POST /updatePOSuppStatus — query or body: poNumber, status, comments */
const postUpdateSupplierPoStatus: RequestHandler = async (req, res) => {
  try {
    const poNumber = (req.query.poNumber ?? req.query.po_number ?? (req.body as any)?.poNumber) as string;
    const status = (req.query.status ?? (req.body as any)?.status) as string;
    const comments = String(req.query.comments ?? (req.body as any)?.comments ?? "");
    if (!poNumber?.trim() || !status?.trim()) {
      return res.status(400).json({ error: "poNumber and status are required" });
    }
    const msg = await service.updateSupplierPoStatus(
      poNumber.trim(),
      status.trim(),
      comments,
      (req as any).user,
    );
    if (msg.startsWith("Error")) {
      return res.status(500).json({ message: msg });
    }
    res.json({ message: msg });
  } catch (error: any) {
    handleError(res, error, "Failed to update PO supplier status");
  }
};

router.post("/api/purchase-requests/ai/suggest-items", async (req, res) => {
  try {
    const { title, description, department } = req.body;
    if (!title || !department) {
      return res
        .status(400)
        .json({ error: "Title and department are required" });
    }
    const suggestions = await service.suggestItems(
      title,
      description || "",
      department,
    );
    res.json({ suggestions });
  } catch (error) {
    console.error("Error suggesting items:", error);
    res.status(500).json({ error: "Failed to get item suggestions" });
  }
});

router.post("/api/requisitions/:prNumber/ai-assisted", async (req, res) => {
  try {
    const result = await service.aiAssistedLines(req.params.prNumber);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to process AI assisted items");
  }
});

router.post("/api/requisitions/:prNumber/ai-chat", async (req, res) => {
  try {
    const { userRequest } = req.body;
    if (!userRequest) {
      return res.status(400).json({ error: "User request is required" });
    }
    const result = await service.aiChatRecommendations(
      req.params.prNumber,
      userRequest,
    );
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to get smart recommendations");
  }
});

router.post("/api/purchase-requests/ai/parse-text", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }
    const items = await service.parseText(text);
    res.json({ items });
  } catch (error) {
    console.error("Error parsing text:", error);
    res.status(500).json({ error: "Failed to parse text into items" });
  }
});

router.post("/api/purchase-requests/ai/check-duplicate", async (req, res) => {
  try {
    const { title, description, department } = req.body;
    if (!title || !department) {
      return res
        .status(400)
        .json({ error: "Title and department are required" });
    }
    const result = await service.checkDuplicate(
      title,
      description || "",
      department,
    );
    res.json(result);
  } catch (error) {
    console.error("Error checking duplicates:", error);
    res.status(500).json({ error: "Failed to check for duplicates" });
  }
});

router.post("/api/purchase-requests/ai/predict-quantity", async (req, res) => {
  try {
    const { itemDescription, department, existingQuantity, budgetLineId } = req.body;
    if (!itemDescription || !department) {
      return res
        .status(400)
        .json({ error: "Item description and department are required" });
    }
    const parsedBudgetLineId =
      budgetLineId !== undefined && budgetLineId !== null && !Number.isNaN(Number(budgetLineId))
        ? Number(budgetLineId)
        : null;
    const result = await service.predictQty(
      itemDescription,
      department,
      existingQuantity,
      parsedBudgetLineId,
    );
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to predict quantity");
  }
});

router.post("/api/purchase-requests/ai/validate-budget", async (req, res) => {
  try {
    const { department, totalAmount, title, budgetLineId, currency, fromPR, prNumber, fromBid, bidAwardId} = req.body;
    if (!department || totalAmount === undefined) {
      return res
        .status(400)
        .json({ error: "Department and total amount are required" });
    }
    const result = await service.validateBudgetAmount(
      department,
      totalAmount,
      title || "",
      budgetLineId ?? null,
      currency ?? "",
      fromPR ?? false,
      prNumber ?? "",
      fromBid ?? false,
      bidAwardId ?? "",
    );
    res.json(result);
  } catch (error) {
    console.error("Error validating budget:", error);
    res.status(500).json({ error: "Failed to validate budget" });
  }
});

router.post("/api/purchase-requests/ai/recommend-vendors", async (req, res) => {
  try {
    const { lineItems } = req.body;
    if (!lineItems || !Array.isArray(lineItems)) {
      return res.status(400).json({ error: "Line items array is required" });
    }
    const result = await service.recommendVendorsForItems(lineItems);
    res.json({ vendors: result });
  } catch (error) {
    console.error("Error recommending vendors:", error);
    res.status(500).json({ error: "Failed to recommend vendors" });
  }
});

router.get("/api/requisitions/mention-search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(Number(req.query.limit) || 8, 20);
    // Routed through getRequisitions so the picker offers exactly the PRs the user can see
    // on their Requisitions list — never other users' PR numbers or descriptions.
    const sessionUser = resolveRequestUser(req);
    if (!sessionUser?.id) return res.json({ purchaseRequests: [] });
    const result = await service.getRequisitions(
      { page: "1", limit: String(limit), ...(q ? { search: q } : {}) },
      String(sessionUser?.userRole),
      String(sessionUser?.orgIds),
      String(sessionUser?.department),
      sessionUser?.id,
    );
    const rows: any[] = (result as any).data || [];
    const purchaseRequests = rows
      .map((row: any) => ({
        prNumber: String(row.pr_number || ""),
        prDescription: row.pr_description ? String(row.pr_description) : null,
        prStatus: row.pr_status ? String(row.pr_status) : null,
      }))
      .filter((pr) => pr.prNumber.length > 0);
    res.json({ purchaseRequests });
  } catch (error) {
    console.error("Failed to search purchase requests for mention:", error);
    res.status(500).json({ error: "Failed to search purchase requests" });
  }
});

router.get("/api/requisitions", async (req, res) => {
  try {
    const sessionUser = resolveRequestUser(req);
    const result = await service.getRequisitions(req.query, String(sessionUser?.userRole), String(sessionUser?.orgIds), String(sessionUser?.department),sessionUser?.id);
    res.json(result);
  } catch (error) {
    console.error("Error fetching requisitions:", error);
    res.status(500).json({ error: "Failed to fetch requisitions" });
  }
});

router.post("/api/requisitions", async (req, res) => {
  try {
    const result = await service.createRequisition(req.body);
    res.status(201).json(result);
    audit(
      req,
      String((result as any).prNumber || (result as any).id),
      "CREATE",
      "Requisition created",
      "PROCUREMENT",
    );
  } catch (error) {
    console.error("Error creating requisition:", error);
    res.status(500).json({ error: "Failed to create requisition" });
  }
});

router.get("/api/requisitions/stats", async (req, res) => {
  try {
    const sessionUser = resolveRequestUser(req);
    const result = await service.getRequisitionStats(sessionUser?.department, sessionUser?.userRole, sessionUser?.orgIds, sessionUser?.id, sessionUser?.userName);
    res.json(result);
  } catch (error) {
    console.error("Error fetching requisition stats:", error);
    res.status(500).json({ error: "Failed to fetch requisition stats" });
  }
});

router.get("/api/requisitions/:prNumber", async (req, res) => {
  try {
    const result = await service.getRequisitionDetail(req.params.prNumber);
    if (!result) {
      return res.status(404).json({ error: "Requisition not found" });
    }
    res.json(result);
  } catch (error) {
    console.error("Error fetching requisition:", error);
    res.status(500).json({ error: "Failed to fetch requisition" });
  }
});

router.get("/api/requisitions/:prNumber/lines/bulk-import/template", async (req, res) => {
  try {
    const buffer = await service.downloadPRLinesTemplate(req.params.prNumber);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="pr_line_items_template.xlsx"');
    res.send(buffer);
  } catch (error) {
    handleError(res, error, "Failed to generate PR lines import template");
  }
});

router.post("/api/requisitions/:prNumber/lines/bulk-import/validate", upload.single("file"), async (req, res) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "No file provided" });
    const result = await service.validateBulkPRLinesImport(req.params.prNumber, file);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to validate PR lines import file");
  }
});

router.post("/api/requisitions/:prNumber/lines/bulk-import", upload.single("file"), async (req, res) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "No file provided" });
    const user = (req as any).user;
    const result = await service.bulkImportPRLines(req.params.prNumber, file, user);
    res.status(201).json(result);
    audit(req, req.params.prNumber, "CREATE", `Bulk import: ${result.created} PR lines created, ${result.errors} failed`, "PROCUREMENT");
  } catch (error) {
    handleError(res, error, "Failed to bulk import PR lines");
  }
});

router.post("/api/requisitions/:prNumber/lines", async (req, res) => {
  try {
    const result = await service.addRequisitionLine(
      req.params.prNumber,
      req.body,
    );
    res.json(result);
    audit(
      req,
      req.params.prNumber,
      "CREATE",
      "Requisition line item added",
      "PROCUREMENT",
    );
  } catch (error: any) {
    handleError(res, error, "Failed to add line item");
  }
});

router.put("/api/requisitions/:prNumber/lines/:lineId", async (req, res) => {
  try {
    const result = await service.updateRequisitionLine(
      req.params.prNumber,
      req.params.lineId,
      req.body,
    );
    res.json(result);
    audit(
      req,
      req.params.prNumber,
      "UPDATE",
      "Requisition line item updated",
      "PROCUREMENT",
    );
  } catch (error: any) {
    handleError(res, error, "Failed to update line item");
  }
});

router.delete("/api/requisitions/:prNumber/lines/:lineId", async (req, res) => {
  try {
    const result = await service.deleteRequisitionLine(
      req.params.prNumber,
      req.params.lineId,
    );
    res.json(result);
    audit(
      req,
      req.params.prNumber,
      "DELETE",
      "Requisition line item deleted",
      "PROCUREMENT",
    );
  } catch (error: any) {
    handleError(res, error, "Failed to delete line item");
  }
});

router.post("/api/requisitions/:prNumber/copy", async (req, res) => {
  try {
    const result = await service.copyRequisition(req.params.prNumber);
    res.status(201).json(result);
    audit(
      req,
      result.prNumber,
      "CREATE",
      `PR copied from ${req.params.prNumber}`,
      "PROCUREMENT",
    );
  } catch (error: any) {
    handleError(res, error, "Failed to copy requisition");
  }
});

router.post("/api/purchase-orders/:poNumber/cancel", async (req, res) => {
  try {
    const result = await service.cancelPurchaseOrder(
      req.params.poNumber,
      (req as any).user,
      req.body?.comments,
    );
    res.json(result);
    audit(
      req,
      req.params.poNumber,
      "CANCELLED",
      "Purchase order cancelled",
      "PROCUREMENT",
    );
  } catch (error: any) {
    handleError(res, error, "Failed to cancel purchase order");
  }
});

router.post("/api/purchase-orders/:poNumber/copy", async (req, res) => {
  try {
    const result = await service.copyPurchaseOrder(req.params.poNumber);
    res.status(201).json(result);
    audit(
      req,
      result.poNumber,
      "CREATE",
      `PO copied from ${req.params.poNumber}`,
      "PROCUREMENT",
    );
  } catch (error: any) {
    handleError(res, error, "Failed to copy purchase order");
  }
});

router.delete("/api/requisitions/:prNumber", async (req, res) => {
  try {
    const result = await service.deleteRequisition(req.params.prNumber);
    res.json(result);
    audit(
      req,
      req.params.prNumber,
      "DELETE",
      "Requisition deleted",
      "PROCUREMENT",
    );
  } catch (error: any) {
    handleError(res, error, "Failed to delete requisition");
  }
});

router.put("/api/requisitions/:prNumber", async (req, res) => {
  try {
    const result = await service.updateRequisition(
      req.params.prNumber,
      req.body,
    );
    res.json(result);
    audit(
      req,
      req.params.prNumber,
      "UPDATE",
      "Requisition updated",
      "PROCUREMENT",
    );
  } catch (error: any) {
    handleError(res, error, "Failed to update requisition");
  }
});

router.post("/api/requisitions/:prNumber/submit", async (req, res) => {
  try {
    const result = await service.submitRequisition(
      req.params.prNumber,
      (req as any).user,
    );
    res.json(result);
    audit(
      req,
      req.params.prNumber,
      "SUBMIT",
      "Requisition submitted for approval",
      "PROCUREMENT",
    );
  } catch (error: any) {
    handleError(res, error, "Failed to submit requisition for approval");
  }
});

router.post("/api/requisitions/:prNumber/cancel", async (req, res) => {
  try {
    const result = await service.cancelRequisition(
      req.params.prNumber,
      (req as any).user,
    );
    res.json(result);
    audit(
      req,
      req.params.prNumber,
      "CANCELLED",
      "Requisition cancelled",
      "PROCUREMENT",
    );
  } catch (error: any) {
    handleError(res, error, "Failed to cancel requisition");
  }
});

router.post(
  "/api/requisitions/:prNumber/process-approval",
  async (req, res) => {
    try {
      const result = await service.processRequisitionApproval(
        req.params.prNumber,
        req.body,
        (req as any).user,
      );
      res.json(result);
      audit(
        req,
        req.params.prNumber,
        "APPROVAL",
        "Requisition approval processed",
        "PROCUREMENT",
      );
    } catch (error: any) {
      handleError(res, error, "Error occurred while processing your request!");
    }
  },
);

router.get("/api/requisitions/meta/departments", async (req, res) => {
  try {
    const result = await service.getPrDepartments();
    res.json(result);
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({ error: "Failed to fetch departments" });
  }
});

router.get("/api/requisitions/:prNumber/documents", rewrapTenantContext, async (req, res) => {
  try {
    const result = await service.getRequisitionDocuments(req.params.prNumber);
    res.json(result);
  } catch (error) {
    console.error("Error fetching requisition documents:", error);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

router.post("/api/requisitions/:prNumber/documents", upload.single("file"), rewrapTenantContext, async (req, res) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "No file provided" });
    const user = resolveRequestUser(req);
    const createdBy = user?.userName || "system";
    const result = await service.addRequisitionDocument(
      req.params.prNumber,
      file,
      createdBy,
      getTenantDomain(req) ?? undefined,
    );
    res.status(201).json(result);
    audit(req, req.params.prNumber, "CREATE", "Requisition document added", "PROCUREMENT");
  } catch (error: any) {
    handleError(res, error, "Failed to add document");
  }
});

router.get("/api/requisitions/:prNumber/documents/:docId/download", rewrapTenantContext, async (req, res) => {
  try {
    const { streamFileFromAzure } = await import("../../services/azure-blob.service");
    const { blobUrl, mimeType, filename } = await service.downloadCollaborationDocument(req.params.docId);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    await streamFileFromAzure(blobUrl, res);
  } catch (error: any) {
    handleError(res, error, "Failed to download document");
  }
});

router.delete(
  "/api/requisitions/:prNumber/documents/:docId",
  rewrapTenantContext,
  async (req, res) => {
    try {
      const result = await service.deleteRequisitionDocumentById(
        req.params.prNumber,
        req.params.docId,
      );
      res.json(result);
      audit(
        req,
        req.params.prNumber,
        "DELETE",
        "Requisition document deleted",
        "PROCUREMENT",
      );
    } catch (error) {
      console.error("Error deleting requisition document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  },
);

router.get("/api/requisitions/:prNumber/notes", async (req, res) => {
  try {
    const result = await service.getRequisitionNotes(req.params.prNumber);
    res.json(result);
  } catch (error) {
    console.error("Error fetching requisition notes:", error);
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

router.put("/api/requisitions/:prNumber/notes", async (req, res) => {
  try {
    const result = await service.updateRequisitionNotes(
      req.params.prNumber,
      req.body.notes,
    );
    res.json(result);
    audit(
      req,
      req.params.prNumber,
      "UPDATE",
      "Requisition notes updated",
      "PROCUREMENT",
    );
  } catch (error) {
    console.error("Error updating requisition notes:", error);
    res.status(500).json({ error: "Failed to update notes" });
  }
});

router.get("/api/requisitions/:prNumber/comments", async (req, res) => {
  try {
    const result = await service.getRequisitionComments(req.params.prNumber);
    res.json(result);
  } catch (error) {
    console.error("Error fetching requisition comments:", error);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

router.post("/api/requisitions/:prNumber/comments", async (req, res) => {
  try {
    const result = await service.addRequisitionComment(
      req.params.prNumber,
      req.body,
    );
    res.status(201).json(result);
    audit(
      req,
      req.params.prNumber,
      "CREATE",
      "Requisition comment added",
      "PROCUREMENT",
    );
  } catch (error) {
    console.error("Error adding requisition comment:", error);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

router.delete(
  "/api/requisitions/:prNumber/comments/:commentId",
  async (req, res) => {
    try {
      const result = await service.deleteRequisitionCommentById(
        req.params.prNumber,
        req.params.commentId,
      );
      res.json(result);
      audit(
        req,
        req.params.prNumber,
        "DELETE",
        "Requisition comment deleted",
        "PROCUREMENT",
      );
    } catch (error) {
      console.error("Error deleting requisition comment:", error);
      res.status(500).json({ error: "Failed to delete comment" });
    }
  },
);

router.get("/api/purchase-orders/mention-search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(Number(req.query.limit) || 8, 20);
    // Routed through getPurchaseOrders so the picker offers exactly the POs the user can see
    // on their Purchase Orders list — never other users' PO numbers or descriptions.
    const sessionUser = resolveRequestUser(req);
    if (!sessionUser?.id) return res.json({ purchaseOrders: [] });
    const result = await service.getPurchaseOrders(
      { page: "1", limit: String(limit), ...(q ? { search: q } : {}) },
      sessionUser,
    );
    const rows: any[] = (result as any).data || [];
    const purchaseOrders = rows
      .map((row: any) => ({
        poNumber: String(row.po_number || ""),
        poDescription: row.po_description ? String(row.po_description) : null,
        poStatus: row.po_status ? String(row.po_status) : null,
        companyName: row.company_name ? String(row.company_name) : null,
      }))
      .filter((po) => po.poNumber.length > 0);
    res.json({ purchaseOrders });
  } catch (error) {
    console.error("Failed to search purchase orders for mention:", error);
    res.status(500).json({ error: "Failed to search purchase orders" });
  }
});

router.get("/api/purchase-orders/stats", async (req, res) => {
  try {
    const sessionUser = resolveRequestUser(req);
    const result = await service.getPoStats(sessionUser);
    res.json(result);
  } catch (error) {
    console.error("Error getting PO stats:", error);
    res.status(500).json({ error: "Failed to get PO stats" });
  }
});

router.get("/api/purchase-orders", async (req, res) => {
  try {
    const sessionUser = resolveRequestUser(req);
    const result = await service.getPurchaseOrders(req.query, sessionUser);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to get purchase orders");
  }
});

router.post("/api/purchase-orders/from-bid-award", async (req, res) => {
  try {
    const sessionUser = resolveRequestUser(req);
    const result = await service.createPOFromBidAward(req.body, sessionUser);
    res.json(result);
    audit(req, result.poNumber, "CREATE", `PO Created from Bid Award`, "PO");
  } catch (error: any) {
    handleError(res, error, "Failed to create PO from Bid Award");
  }
});

router.post("/api/purchase-orders/from-pr", async (req, res) => {
  try {
    const sessionUser = resolveRequestUser(req);
    const result = await service.createPOFromPR(req.body, sessionUser);
    res.json(result);
    audit(
      req,
      result.poNumber,
      "CREATE",
      `PO created from PR ${req.body.prNumber}`,
      "PROCUREMENT",
    );
  } catch (error: any) {
    handleError(res, error, "Failed to create PO from PR");
  }
});

router.get("/api/purchase-orders/pr-details/:prNumber", async (req, res) => {
  try {
    const result = await service.getPRDetailsForPO(req.params.prNumber);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to get PR details");
  }
});

router.get("/api/purchase-orders/contract-details/:contractId", async (req, res) => {
  try {
    const result = await service.getContractDetailsForPO(req.params.contractId);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to get contract details");
  }
});

router.post("/api/purchase-orders/from-contract", async (req, res) => {
  try {
    const sessionUser = resolveRequestUser(req);
    const result = await service.createPOFromContract(req.body, sessionUser);
    res.json(result);
    audit(
      req,
      result.poNumber,
      "CREATE",
      `PO created from Contract ${req.body.contractId}`,
      "PROCUREMENT",
    );
  } catch (error: any) {
    handleError(res, error, "Failed to create PO from Contract");
  }
});

router.post("/api/purchase-orders/ai-suggest-vendor", async (req, res) => {
  try {
    const { lineItems, prNumber, deliveryLocation } = req.body || {};
    if (!lineItems || lineItems.length === 0) {
      return res.json({
        recommendationLevel: "none",
        noRecommendationReason:
          "No recommendation available: the PR has no line items to evaluate.",
        vendors: [],
      });
    }

    const { recommendSuppliersForPR } = await import(
      "../../services/pr-po-supplier-recommend-service"
    );

    const result = await recommendSuppliersForPR({
      prNumber: prNumber ? String(prNumber) : undefined,
      lineItems,
      deliveryLocation:
        deliveryLocation ??
        lineItems.find((l: any) => l.delivertto_location_name)?.delivertto_location_name ??
        null,
    });

    res.json(result);
  } catch (error: any) {
    console.error("Error suggesting vendors:", error);
    res.json({
      recommendationLevel: "none",
      noRecommendationReason:
        "No recommendation available: an unexpected error occurred while evaluating suppliers.",
      vendors: [],
    });
  }
});

router.post("/api/purchase-orders", async (req, res) => {
  try {
    const sessionUser = resolveRequestUser(req);
    const poData = {
      ...req.body,
      poType: "Standard",
      buyerId: sessionUser?.id || null,
      orgId: req.body.orgId || sessionUser?.orgId || null,
      buyerName: sessionUser?.name || sessionUser?.userName || null,
    };
    const result = await service.createPurchaseOrder(poData);
    res.json(result);
    audit(
      req,
      String((result as any).poNumber || (result as any).id),
      "CREATE",
      "Purchase order created",
      "PROCUREMENT",
    );
  } catch (error) {
    console.error("Error creating purchase order:", error);
    res.status(500).json({ error: "Failed to create purchase order" });
  }
});

router.post("/api/purchase-orders/updatePOSuppStatus", async (req, res) => {
  try {
    const poNumber = (req.query.poNumber ?? req.query.po_number ?? (req.body as any)?.poNumber) as string;
    const status = (req.query.status ?? (req.body as any)?.status) as string;
    const comments = String(req.query.comments ?? (req.body as any)?.comments ?? "");
    if (!poNumber?.trim() || !status?.trim()) {
      return res.status(400).json({ error: "poNumber and status are required" });
    }
    const msg = await service.updateSupplierPoStatus(
      poNumber.trim(),
      status.trim(),
      comments,
      (req as any).user,
    );
    if (msg.startsWith("Error")) {
      return res.status(500).json({ message: msg });
    }
    res.json({ message: msg });
  } catch (error: any) {
    handleError(res, error, "Failed to update PO supplier status");
  }
});

router.get("/api/purchase-orders/:poNumber", async (req, res) => {
  try {
    const result = await service.getPurchaseOrderDetail(req.params.poNumber);
    if (!result) {
      return res.status(404).json({ error: "Purchase Order not found" });
    }
    const sessionUser = resolveRequestUser(req);
    const isSupplier =
      sessionUser?.userRole === "ROLE_SUPPLIER_ADMIN" ||
      sessionUser?.userRole === "ROLE_SUPPLIER_USER";
    if (isSupplier) {
      const hiddenStatuses = ["Draft", "Pending Approval", "Rejected"];
      if (hiddenStatuses.includes(result.header?.po_status)) {
        return res
          .status(403)
          .json({ error: "You do not have access to this purchase order" });
      }
      const { budget_name, budget_segment, ...vendorResult } = result as any;
      return res.json(vendorResult);
    }
    res.json(result);
  } catch (error) {
    console.error("Error getting purchase order:", error);
    res.status(500).json({ error: "Failed to get purchase order" });
  }
});

router.get(
  "/api/purchase-orders/:poNumber/delivery-notes",
  async (req, res) => {
    try {
      const result = await service.getPoDeliveryNotes(req.params.poNumber);
      res.json(result);
    } catch (error) {
      console.error("Error getting delivery notes:", error);
      res.status(500).json({ error: "Failed to get delivery notes" });
    }
  },
);

router.put("/api/purchase-orders/:poNumber/update-tax-included", async (req, res) => {
  try {
    const taxIncluded = (req.body.taxIncluded === "Yes") ? "Yes" : "No";
    const result = await service.updateTaxIncluded(req.params.poNumber, taxIncluded);
    res.json(result);
  } catch (error) {
    console.error("Error updating tax included:", error);
    res.status(500).json({ error: "Failed to update tax included" });
  }
});

router.get("/api/purchase-orders/:poNumber/grns", async (req, res) => {
  try {
    const result = await service.getPoGrns(req.params.poNumber);
    res.json(result);
  } catch (error) {
    console.error("Error getting GRNs:", error);
    res.status(500).json({ error: "Failed to get GRNs" });
  }
});

router.get("/api/purchase-orders/:poNumber/invoices", async (req, res) => {
  try {
    const result = await service.getPoInvoices(req.params.poNumber);
    res.json(result);
  } catch (error) {
    console.error("Error getting invoices:", error);
    res.status(500).json({ error: "Failed to get invoices" });
  }
});

router.get("/api/purchase-orders/:poNumber/notes", async (req, res) => {
  try {
    const result = await service.getPoNotes(req.params.poNumber);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to get PO notes");
  }
});

router.put("/api/purchase-orders/:poNumber/notes", async (req, res) => {
  try {
    const result = await service.updatePoNotes(
      req.params.poNumber,
      req.body.notes,
    );
    res.json(result);
    audit(
      req,
      req.params.poNumber,
      "UPDATE",
      "PO notes updated",
      "PROCUREMENT",
    );
  } catch (error) {
    console.error("Error updating PO notes:", error);
    res.status(500).json({ error: "Failed to update PO notes" });
  }
});

// PO Collaboration - Documents
router.get("/api/purchase-orders/:poNumber/documents", rewrapTenantContext, async (req, res) => {
  try {
    const result = await service.getPoDocuments(req.params.poNumber);
    res.json(result);
  } catch (error) {
    console.error("Error fetching PO documents:", error);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

router.post("/api/purchase-orders/:poNumber/documents", upload.single("file"), rewrapTenantContext, async (req, res) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "No file provided" });
    const user = resolveRequestUser(req);
    const createdBy = user?.userName || "system";
    const result = await service.addPoDocument(
      req.params.poNumber,
      file,
      createdBy,
      getTenantDomain(req) ?? undefined,
    );
    res.status(201).json(result);
    audit(req, req.params.poNumber, "CREATE", "PO document added", "PROCUREMENT");
  } catch (error: any) {
    handleError(res, error, "Failed to add document");
  }
});

router.get("/api/purchase-orders/:poNumber/documents/:docId/download", rewrapTenantContext, async (req, res) => {
  try {
    const { streamFileFromAzure } = await import("../../services/azure-blob.service");
    const { blobUrl, mimeType, filename } = await service.downloadCollaborationDocument(req.params.docId);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    await streamFileFromAzure(blobUrl, res);
  } catch (error: any) {
    handleError(res, error, "Failed to download document");
  }
});

router.delete(
  "/api/purchase-orders/:poNumber/documents/:docId",
  rewrapTenantContext,
  async (req, res) => {
    try {
      const result = await service.deletePoDocumentById(
        req.params.poNumber,
        req.params.docId,
      );
      res.json(result);
      audit(
        req,
        req.params.poNumber,
        "DELETE",
        "PO document deleted",
        "PROCUREMENT",
      );
    } catch (error) {
      console.error("Error deleting PO document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  },
);

// PO Collaboration - Comments
router.get("/api/purchase-orders/:poNumber/comments", async (req, res) => {
  try {
    const result = await service.getPoComments(req.params.poNumber);
    res.json(result);
  } catch (error) {
    console.error("Error fetching PO comments:", error);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

router.post("/api/purchase-orders/:poNumber/comments", async (req, res) => {
  try {
    const result = await service.addPoComment(req.params.poNumber, req.body);
    res.status(201).json(result);
    audit(
      req,
      req.params.poNumber,
      "CREATE",
      "PO comment added",
      "PROCUREMENT",
    );
  } catch (error) {
    console.error("Error adding PO comment:", error);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

router.delete(
  "/api/purchase-orders/:poNumber/comments/:commentId",
  async (req, res) => {
    try {
      const result = await service.deletePoCommentById(
        req.params.poNumber,
        req.params.commentId,
      );
      res.json(result);
      audit(
        req,
        req.params.poNumber,
        "DELETE",
        "PO comment deleted",
        "PROCUREMENT",
      );
    } catch (error) {
      console.error("Error deleting PO comment:", error);
      res.status(500).json({ error: "Failed to delete comment" });
    }
  },
);

router.put("/api/purchase-orders/:poNumber", async (req, res) => {
  try {
    const result = await service.updatePurchaseOrder(
      req.params.poNumber,
      req.body,
    );
    res.json(result);
    audit(
      req,
      req.params.poNumber,
      "UPDATE",
      "Purchase order updated",
      "PROCUREMENT",
    );
  } catch (error: any) {
    handleError(res, error, "Failed to update purchase order");
  }
});

router.delete("/api/purchase-orders/:poNumber", async (req, res) => {
  try {
    const result = await service.deletePurchaseOrder(req.params.poNumber);
    res.json(result);
    audit(
      req,
      req.params.poNumber,
      "DELETE",
      "Purchase order deleted",
      "PROCUREMENT",
    );
  } catch (error: any) {
    handleError(res, error, "Failed to delete purchase order");
  }
});

router.get("/api/purchase-orders/:poNumber/active-task", async (req, res) => {
  try {
    const { workflowService } = await import("../../services/workflowService");
    const task = await workflowService.findActiveTaskByRefNumber(
      req.params.poNumber,
    );
    res.json(task || null);
  } catch (error: any) {
    handleError(res, error, "Failed to find active task");
  }
});

router.post("/api/purchase-orders/:poNumber/submit", async (req, res) => {
  try {
    const result = await service.submitPurchaseOrder(
      req.params.poNumber,
      (req as any).user,
    );
    res.json(result);
    audit(
      req,
      req.params.poNumber,
      "SUBMIT",
      "Purchase order submitted for approval",
      "PROCUREMENT",
    );
  } catch (error: any) {
    handleError(res, error, "Failed to submit purchase order for approval");
  }
});

router.post(
  "/api/purchase-orders/:poNumber/process-approval",
  async (req, res) => {
    try {
      const result = await service.processPoApproval(
        req.params.poNumber,
        req.body,
        (req as any).user,
      );
      res.json(result);
      const actionResult = (req.body.result || "").toLowerCase();
      if (actionResult === "rejected" || actionResult === "reject") {
        audit(
          req,
          req.params.poNumber,
          "REJECTED",
          "PO Rejected",
          "PROCUREMENT",
        );
      } else if (
        actionResult === "more info required" ||
        actionResult === "more"
      ) {
        audit(
          req,
          req.params.poNumber,
          "REQUESTFORMOREINFO",
          "PO requested for more info",
          "PROCUREMENT",
        );
      } else if (actionResult === "resubmit") {
        audit(
          req,
          req.params.poNumber,
          "RESUBMIT",
          "PO is Re Submitted",
          "PROCUREMENT",
        );
      } else {
        audit(
          req,
          req.params.poNumber,
          "APPROVAL",
          "Purchase order approval processed",
          "PROCUREMENT",
        );
      }
    } catch (error: any) {
      handleError(res, error, "Failed to process purchase order approval");
    }
  },
);

router.get("/api/purchase-orders/:poNumber/lines/bulk-import/template", async (req, res) => {
  try {
    const buffer = await service.downloadPOLinesTemplate(req.params.poNumber);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="po_line_items_template.xlsx"');
    res.send(buffer);
  } catch (error) {
    handleError(res, error, "Failed to generate PO lines import template");
  }
});

router.post("/api/purchase-orders/:poNumber/lines/bulk-import/validate", upload.single("file"), async (req, res) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "No file provided" });
    const result = await service.validateBulkPOLinesImport(req.params.poNumber, file);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to validate PO lines import file");
  }
});

router.post("/api/purchase-orders/:poNumber/lines/bulk-import", upload.single("file"), async (req, res) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "No file provided" });
    const user = (req as any).user;
    const result = await service.bulkImportPOLines(req.params.poNumber, file, user);
    res.status(201).json(result);
    audit(req, req.params.poNumber, "CREATE", `Bulk import: ${result.created} PO lines created, ${result.errors} failed`, "PROCUREMENT");
  } catch (error) {
    handleError(res, error, "Failed to bulk import PO lines");
  }
});

router.post("/api/purchase-orders/:poNumber/lines", async (req, res) => {
  try {
    const result = await service.addPoLine(req.params.poNumber, req.body);
    res.json(result);
    audit(
      req,
      req.params.poNumber,
      "CREATE",
      "PO line item added",
      "PROCUREMENT",
    );
  } catch (error: any) {
    handleError(res, error, "Failed to add line item");
  }
});

router.put("/api/purchase-orders/:poNumber/lines/:lineId", async (req, res) => {
  try {
    const result = await service.updatePoLine(
      req.params.poNumber,
      req.params.lineId,
      req.body,
    );
    res.json(result);
    audit(
      req,
      req.params.poNumber,
      "UPDATE",
      "PO line item updated",
      "PROCUREMENT",
    );
  } catch (error: any) {
    handleError(res, error, "Failed to update line item");
  }
});

router.delete(
  "/api/purchase-orders/:poNumber/lines/:lineId",
  async (req, res) => {
    try {
      const result = await service.deletePoLineItem(
        req.params.poNumber,
        req.params.lineId,
      );
      res.json(result);
      audit(
        req,
        req.params.poNumber,
        "DELETE",
        "PO line item deleted",
        "PROCUREMENT",
      );
    } catch (error: any) {
      handleError(res, error, "Failed to delete line item");
    }
  },
);

router.get("/api/categories", async (req, res) => {
  try {
    const categories = await service.getCategories(req.query);
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

router.get("/api/categories/:id", async (req, res) => {
  try {
    const category = await service.getCategory(req.params.id);
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch category" });
  }
});

router.get("/api/categories/code/:code", async (req, res) => {
  try {
    const category = await service.getCategoryByCode(req.params.code);
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch category" });
  }
});

router.post("/api/categories", async (req, res) => {
  try {
    const category = await service.createCategory(req.body);
    res.status(201).json(category);
    audit(
      req,
      String(category.id),
      "CREATE",
      "Category created",
      "PROCUREMENT",
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: "Failed to create category" });
  }
});

router.patch("/api/categories/:id", async (req, res) => {
  try {
    const category = await service.updateCategory(req.params.id, req.body);
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }
    res.json(category);
    audit(req, req.params.id, "UPDATE", "Category updated", "PROCUREMENT");
  } catch (error) {
    res.status(500).json({ error: "Failed to update category" });
  }
});

router.delete("/api/categories/:id", async (req, res) => {
  try {
    const deleted = await service.deleteCategory(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Category not found" });
    }
    res.status(204).send();
    audit(req, req.params.id, "DELETE", "Category deleted", "PROCUREMENT");
  } catch (error) {
    res.status(500).json({ error: "Failed to delete category" });
  }
});

router.post("/api/product-categories", async (req, res) => {
  try {
    const user = (req as any).user;
    const categoryData = {
      ...req.body,
      createdBy: user?.name || user?.userName || "SYSTEM_USER"
    };

    const result = await service.createProductCategory(categoryData);
    res.status(201).json(result);

    audit(
      req,
      String(result.categoryId),
      "CREATE",
      `Product Category ${result.categoryName} created`,
      "PROCUREMENT"
    );
  } catch (error: any) {
    handleError(res, error, "Failed to create product category");
  }
});

router.get("/api/product-categories", async (req, res) => {
  try {

    const result = await service.getProductCategories(req.query);

    res.json(result);

  } catch (error) {
    console.error("Error fetching product categories:", error);
    res.status(500).json({ error: "Failed to fetch product categories" });
  }
});



router.put("/api/product-categories/:categoryId", async (req, res) => {
  try {
    const user = (req as any).user;
    const categoryId = req.params.categoryId;
    const categoryData = {
      ...req.body,
      lastModifiedBy: user?.name || user?.userName || "SYSTEM_USER"
    };

    const result = await service.updateProductCategory(categoryId, categoryData);
    res.json(result);

    audit(
      req,
      categoryId,
      "UPDATE",
      `Product Category ${result.categoryName} updated`,
      "PROCUREMENT"
    );
  } catch (error: any) {
    handleError(res, error, "Failed to update product category");
  }
});

router.delete("/api/product-categories/:categoryId", async (req, res) => {
  try {
    const categoryId = req.params.categoryId;
    const result = await service.deleteProductCategory(categoryId);
    res.json(result);

    audit(
      req,
      categoryId,
      "DELETE",
      `Product Category ID ${categoryId} deleted`,
      "PROCUREMENT"
    );
  } catch (error: any) {
    handleError(res, error, "Failed to delete product category");
  }
});

router.get("/api/product-categories/prod-id/:prodCategoryId", async (req, res) => {
  try {
    const result = await service.getProductCategoryByProdId(req.params.prodCategoryId);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch product category");
  }
});

router.get("/api/product-categories/:categoryId", async (req, res) => {
  try {
    const result = await service.getProductCategoryById(req.params.categoryId);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch product category");
  }
});

router.get("/api/items", async (req, res) => {
  try {
    const result = await service.getItems(req.query);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch items");
  }
});

router.get("/api/items/stats/categories", async (req, res) => {
  try {
    const filters = {
      search: req.query.search as string,
      status: req.query.status as string,
      category: req.query.category as string,
    };
    const stats = await service.getItemCategoryStats(filters);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch category stats" });
  }
});

router.get("/api/items/stats/uncategorized", async (req, res) => {
  try {
    const filters = {
      search: req.query.search as string,
      status: req.query.status as string,
      category: req.query.category as string,
    };
    const count = await service.getUncategorizedItemCount(filters);
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch uncategorized count" });
  }
});

router.get("/api/items/stats/missing-sku", async (req, res) => {
  try {
    const filters = {
      search: req.query.search as string,
      status: req.query.status as string,
      category: req.query.category as string,
    };
    const count = await service.getMissingSkuCount(filters);
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch missing SKU count" });
  }
});

router.get("/api/items/:id", async (req, res) => {
  try {
    const item = await service.getItem(req.params.id);
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch item" });
  }
});

router.get("/api/items/code/:code", async (req, res) => {
  try {
    const item = await service.getItemByCode(req.params.code);
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch item" });
  }
});

router.post("/api/items", async (req, res) => {
  try {
    const item = await service.createItem(req.body);
    res.status(201).json(item);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }else if((error as any).status === 400){
      return res.status(400).json({ error: (error as any).message });
    }
    console.log(error);
    res.status(500).json({ error: "Failed to create item" });
  }
});

router.patch("/api/items/:id", async (req, res) => {
  try {
    const item = await service.updateItem(req.params.id, req.body);
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }
    res.json(item);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }else if((error as any).status === 400){
      return res.status(400).json({ error: (error as any).message });
    }
    res.status(500).json({ error: "Failed to update item" });
  }
});

router.delete("/api/items/:id", async (req, res) => {
  try {
    const deleted = await service.deleteItem(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Item not found" });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete item" });
  }
});

router.post("/api/items/ai/categorize", async (req, res) => {
  try {
    const batchSize = req.body.batchSize || 25;
    const result = await service.aiCategorize(batchSize);
    res.json(result);
  } catch (error) {
    console.error("Categorization error:", error);
    res.status(500).json({ error: "Failed to categorize products" });
  }
});

router.post("/api/items/ai/categorize-all", async (req, res) => {
  try {
    const result = await service.aiCategorizeAll();
    res.json(result);
  } catch (error) {
    console.error("Categorization error:", error);
    res.status(500).json({ error: "Failed to categorize products" });
  }
});

router.post("/api/items/ai/generate-sku", async (req, res) => {
  try {
    const batchSize = req.body.batchSize || 25;
    const result = await service.aiGenerateSku(batchSize);
    res.json(result);
  } catch (error) {
    console.error("SKU generation error:", error);
    res.status(500).json({ error: "Failed to generate SKUs" });
  }
});

router.post("/api/items/ai/generate-sku-all", async (req, res) => {
  try {
    const result = await service.aiGenerateSkuAll();
    res.json(result);
  } catch (error) {
    console.error("SKU generation error:", error);
    res.status(500).json({ error: "Failed to generate SKUs" });
  }
});

router.get("/api/purchase-orders/:poNumber/lines-for-dn", async (req, res) => {
  try {
    const result = await service.getPoLinesForDN(req.params.poNumber);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to get PO lines for DN");
  }
});

router.post(
  "/api/purchase-orders/:poNumber/delivery-notes",
  async (req, res) => {
    try {
      const { header, lines } = req.body;
      const user = (req as any).user;

      const result = await service.createDeliveryNote(
        {
          ...header,
          po_number: req.params.poNumber,
          created_by: user?.name || "System",
        },
        lines.map((l: any) => ({ ...l, po_number: req.params.poNumber })),
        user
      );
      

      res.json(result);
      audit(
        req,
        result.asn_number,
        "CREATE",
        `Delivery Note ${result.asn_number} created for PO ${req.params.poNumber}`,
        "Procurement",
      );
    } catch (error) {
      handleError(res, error, "Failed to create delivery note");
    }
  },
);

router.get("/api/delivery-notes/:deliveryId/lines", async (req, res) => {
  try {
    const result = await service.getDeliveryLinesByDeliveryId(
      Number(req.params.deliveryId),
    );
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to get delivery note lines");
  }
});

router.get(
  "/api/purchase-orders/:poNumber/lines-for-receipt",
  async (req, res) => {
    try {
      const result = await service.getPoLinesForReceipt(req.params.poNumber);
      res.json(result);
    } catch (error) {
      handleError(res, error, "Failed to get PO lines for receipt");
    }
  },
);

router.post("/api/purchase-orders/:poNumber/receipts", async (req, res) => {
  try {
    const { header, lines } = req.body;
    const { poNumber } = req.params;

    // Validate delivery notes exist
    const deliveryNotes = await service.getPoDeliveryNotes(poNumber);
    if (deliveryNotes.length === 0) {
      return res.status(400).json({
        error: 'Cannot create receipt without delivery notes'
      });
    }
    const user = (req as any).user;

    const result = await service.createReceipt(
      {
        ...header,
        po_number: req.params.poNumber,
        created_by: user?.user_name || header.created_by || "system",
        created_by_name:
          user?.name || user?.user_name || header.created_by_name || "System",
        requested_by: header.requested_by || null,
        org_id: header.org_id || user?.org_id || null,
      },
      lines.map((l: any) => ({ ...l, po_number: req.params.poNumber })),
    );

    res.json(result);
    audit(
      req,
      result.receiptnum,
      "CREATE",
      `Receipt ${result.supp_receipt_no || result.receiptnum} created for PO ${req.params.poNumber}`,
      "RECEIPT",
    );
  } catch (error) {
    handleError(res, error, "Failed to create receipt");
  }
});

router.get(
  "/api/purchase-orders/:poNumber/receipts-for-invoice",
  async (req, res) => {
    try {
      const result = await service.getReceiptsForInvoice(req.params.poNumber);
      res.json(result);
    } catch (error) {
      handleError(res, error, "Failed to get receipts for invoice");
    }
  },
);

router.post(
  "/api/purchase-orders/:poNumber/invoices",
  upload.array("files", 10),
  rewrapTenantContext,
  async (req, res) => {
    try {
      const header =
        typeof req.body.header === "string"
          ? JSON.parse(req.body.header)
          : req.body.header;
      const receiptLines =
        typeof req.body.receiptLines === "string"
          ? JSON.parse(req.body.receiptLines)
          : req.body.receiptLines;
      const user = (req as any).user;
      const uploadedFiles = ((req as any).files || []) as Express.Multer.File[];

      const docPreviews: (string | null)[] = req.body.docPreviews
        ? typeof req.body.docPreviews === "string"
          ? JSON.parse(req.body.docPreviews)
          : req.body.docPreviews
        : [];
      const documents: Array<{
        fileName: string;
        filePath: string;
        createdBy: string;
        docUri?: Buffer | null;
      }> = [];
      for (let i = 0; i < uploadedFiles.length; i++) {
        const uploadedFile = uploadedFiles[i];
        const validation = validateUploadedFile(uploadedFile);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }
        const safeName = sanitizeFilename(uploadedFile.originalname);
        const blobUrl = await uploadFileToAzure(uploadedFile.buffer, `INVOICES/${req.params.poNumber}`, safeName, uploadedFile.mimetype, getTenantDomain(req) ?? undefined);
        let docUri: Buffer | null = null;
        const previewDataUrl = docPreviews[i];
        if (
          previewDataUrl &&
          typeof previewDataUrl === "string" &&
          previewDataUrl.startsWith("data:")
        ) {
          const base64Data = previewDataUrl.split(",")[1];
          if (base64Data) {
            docUri = Buffer.from(base64Data, "base64");
          }
        }
        documents.push({
          fileName: safeName,
          filePath: blobUrl,
          createdBy: user?.userName || "system",
          docUri,
        });
      }

      const result = await service.createInvoice(
        {
          ...header,
          po_number: req.params.poNumber,
          created_by: user?.userName || header.created_by || "system",
          submitted_by:
            user?.name || user?.userName || header.submitted_by || "System",
        },
        receiptLines,
        documents.length > 0 ? documents : undefined,
      );

      res.json(result);
      audit(
        req,
        result.invoice_number,
        "CREATE",
        `Invoice ${result.invoice_number} raised and submitted for approval for PO ${req.params.poNumber}`,
        "INVOICE",
      );
    } catch (error) {
      handleError(res, error, "Failed to create invoice");
    }
  },
);

router.post("/api/purchase-orders/:poNumber/ai-analyze", async (req, res) => {
  try {
    const { analyzePurchaseOrder } =
      await import("../../services/po-anomaly-service");
    const result = await analyzePurchaseOrder(req.params.poNumber);
    res.json(result);
    audit(
      req,
      req.params.poNumber,
      "AI_ANALYZE",
      "AI anomaly analysis performed on purchase order",
      "PROCUREMENT",
    );
  } catch (error: any) {
    handleError(res, error, "Failed to analyze purchase order");
  }
});

router.get("/api/purchase-orders/:poNumber/delivery-risk", async (req, res) => {
  try {
    const { analyzeDeliveryRisk } =
      await import("../../services/po-delivery-risk-service");
    const result = await analyzeDeliveryRisk(req.params.poNumber);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to analyze delivery risk");
  }
});

router.get("/api/productsmgmt/getProdCategoriesByParentCategoryId/:id", async (req, res) => {
  try {
    const parentId = parseInt(req.params.id);
    if (isNaN(parentId)) {
      return res.status(400).json({ error: "Invalid parent category ID" });
    }
    const result = await service.getProdCategoriesByParentCategoryId(parentId);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch sub-categories");
  }
});

export const procurementController = router;
