import { Router } from "express";
import * as service from "./rfi.service";
import { logAudit } from "../administration/administration.service";
import { requireAuth, requireStaff, requireVendor, resolveRequestUser } from "../_shared/auth";
import { upload, validateUploadedFile, sanitizeFilename } from "../_shared/file-upload";
import { uploadFileToAzure } from "../../services/azure-blob.service";
import { getTenantDomain } from "../_shared/db";
import { rewrapTenantContext } from "../../tenant-context";

const router = Router();

function handleError(res: any, error: any, fallbackMessage: string) {
  if (error?.status) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(fallbackMessage + ":", error);
  res.status(500).json({ error: error?.message || fallbackMessage });
}

function audit(req: any, auditKey: string, auditAction: string, auditMessage: string) {
  const user = resolveRequestUser(req);
  logAudit({
    auditKey,
    auditAction,
    auditMessage,
    fullName: user?.name || "System",
    userId: user?.id || "system",
    module: "RFI",
  }).catch((err: any) => console.error("[Audit] Failed to log:", err?.message));
}

router.use("/api/rfi", requireAuth);

router.get("/api/rfi/question-library", async (_req, res) => {
  try {
    res.json({ questions: service.listQuestionLibrary(), types: service.listQuestionTypes() });
  } catch (error) {
    handleError(res, error, "Failed to load question library");
  }
});

router.get("/api/rfi/campaigns", async (_req, res) => {
  try {
    const result = await service.listCampaigns();
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to load RFI campaigns");
  }
});

router.post("/api/rfi/campaigns", requireStaff, async (req, res) => {
  try {
    const user = resolveRequestUser(req);
    const result = await service.createCampaign(req.body, user?.email || "system");
    res.status(201).json(result);
    audit(req, result.campaign.campaignCode, "CREATE", `RFI campaign "${result.campaign.title}" created`);
  } catch (error) {
    handleError(res, error, "Failed to create RFI campaign");
  }
});

router.get("/api/rfi/campaigns/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid campaign id" });
    const result = await service.getCampaignDetail(id);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to load RFI campaign");
  }
});

router.patch("/api/rfi/campaigns/:id", requireStaff, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = resolveRequestUser(req);
    const result = await service.updateCampaign(id, req.body, user?.email || "system");
    res.json(result);
    audit(req, String(id), "UPDATE", `RFI campaign "${result.title}" updated`);
  } catch (error) {
    handleError(res, error, "Failed to update RFI campaign");
  }
});

router.delete("/api/rfi/campaigns/:id", requireStaff, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await service.deleteCampaign(id);
    res.json(result);
    audit(req, String(id), "DELETE", `RFI campaign ${id} deleted`);
  } catch (error) {
    handleError(res, error, "Failed to delete RFI campaign");
  }
});

router.post("/api/rfi/campaigns/:id/publish", requireStaff, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = resolveRequestUser(req);
    const result = await service.publishCampaign(id, user?.email || "system");
    res.json(result);
    audit(req, String(id), "UPDATE", `RFI campaign "${result.title}" published`);
  } catch (error) {
    handleError(res, error, "Failed to publish RFI campaign");
  }
});

router.post("/api/rfi/campaigns/:id/close", requireStaff, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = resolveRequestUser(req);
    const result = await service.closeCampaign(id, user?.email || "system");
    res.json(result);
    audit(req, String(id), "UPDATE", `RFI campaign "${result.title}" closed`);
  } catch (error) {
    handleError(res, error, "Failed to close RFI campaign");
  }
});

router.post("/api/rfi/campaigns/:id/suppliers", requireStaff, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = resolveRequestUser(req);
    const suppliers = Array.isArray(req.body?.suppliers) ? req.body.suppliers : [];
    const result = await service.inviteSuppliers(id, suppliers, user?.email || "system");
    res.status(201).json(result);
    audit(req, String(id), "UPDATE", `${result.length} supplier(s) invited to RFI campaign ${id}`);
  } catch (error) {
    handleError(res, error, "Failed to invite suppliers");
  }
});

router.delete("/api/rfi/campaigns/:id/suppliers/:supplierId", requireStaff, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await service.removeSupplier(id, req.params.supplierId);
    res.json(result);
    audit(req, String(id), "UPDATE", `Supplier ${req.params.supplierId} removed from RFI campaign ${id}`);
  } catch (error) {
    handleError(res, error, "Failed to remove supplier");
  }
});

router.patch("/api/rfi/campaigns/:id/suppliers/:supplierId/shortlist", requireStaff, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const isShortlisted = !!req.body?.isShortlisted;
    const result = await service.setSupplierShortlist(id, req.params.supplierId, isShortlisted);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to update shortlist");
  }
});

router.post("/api/rfi/campaigns/:id/questions", requireStaff, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = resolveRequestUser(req);
    const result = await service.addQuestion(id, req.body, user?.email || "system");
    res.status(201).json(result);
    audit(req, String(id), "UPDATE", `Question added to RFI campaign ${id}`);
  } catch (error) {
    handleError(res, error, "Failed to add question");
  }
});

router.patch("/api/rfi/campaigns/:id/questions/:questionId", requireStaff, async (req, res) => {
  try {
    const questionId = Number(req.params.questionId);
    const result = await service.updateQuestion(questionId, req.body);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to update question");
  }
});

router.delete("/api/rfi/campaigns/:id/questions/:questionId", requireStaff, async (req, res) => {
  try {
    const questionId = Number(req.params.questionId);
    const result = await service.deleteQuestion(questionId);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to delete question");
  }
});

router.post("/api/rfi/campaigns/:id/responses", requireStaff, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = resolveRequestUser(req);
    const supplierId = String(req.body?.supplierId ?? "");
    if (!supplierId) return res.status(400).json({ error: "supplierId is required" });
    const result = await service.recordResponse(id, supplierId, req.body?.answers || {}, user?.email || "system");
    res.json(result);
    audit(req, String(id), "UPDATE", `Response recorded for supplier ${supplierId} on RFI campaign ${id}`);
  } catch (error) {
    handleError(res, error, "Failed to record response");
  }
});

async function handleResponseFileUpload(req: any, res: any) {
  try {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "No file provided" });
    const validation = validateUploadedFile(file);
    if (!validation.valid) return res.status(400).json({ error: validation.error });

    const safeName = sanitizeFilename(file.originalname);
    const tenant = getTenantDomain(req) ?? undefined;
    const url = await uploadFileToAzure(file.buffer, "rfi-responses", safeName, file.mimetype, tenant);

    res.json({ name: safeName, size: file.size, type: file.mimetype, url });
  } catch (error) {
    handleError(res, error, "Failed to upload response file");
  }
}

router.post(
  "/api/rfi/campaigns/:id/responses/upload",
  requireStaff,
  upload.single("file"),
  rewrapTenantContext,
  handleResponseFileUpload,
);

// ─── Supplier (vendor) self-service ────────────────────────────────────────
// Suppliers see and respond to only their own invitations — never other
// suppliers' names, contacts, or answers on the same campaign. Every route
// resolves supplierId from the authenticated session, never from the request.

router.use("/api/rfi/supplier", requireVendor);

router.get("/api/rfi/supplier/campaigns", async (req, res) => {
  try {
    const user = resolveRequestUser(req);
    if (!user?.supplierId) return res.status(403).json({ error: "Supplier access required" });
    const result = await service.listCampaignsForSupplier(user.supplierId);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to load your RFI invitations");
  }
});

router.get("/api/rfi/supplier/campaigns/:id", async (req, res) => {
  try {
    const user = resolveRequestUser(req);
    if (!user?.supplierId) return res.status(403).json({ error: "Supplier access required" });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid campaign id" });
    const result = await service.getSupplierCampaignView(id, user.supplierId);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to load campaign");
  }
});

router.post("/api/rfi/supplier/campaigns/:id/responses", async (req, res) => {
  try {
    const user = resolveRequestUser(req);
    if (!user?.supplierId) return res.status(403).json({ error: "Supplier access required" });
    const id = Number(req.params.id);
    const result = await service.recordResponse(id, user.supplierId, req.body?.answers || {}, user.email || user.supplierId);
    res.json(result);
    audit(req, String(id), "UPDATE", `Supplier ${user.supplierId} submitted their RFI response for campaign ${id}`);
  } catch (error) {
    handleError(res, error, "Failed to submit response");
  }
});

router.post(
  "/api/rfi/supplier/campaigns/:id/responses/upload",
  upload.single("file"),
  rewrapTenantContext,
  async (req, res) => {
    const user = resolveRequestUser(req);
    if (!user?.supplierId) return res.status(403).json({ error: "Supplier access required" });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid campaign id" });
    try {
      await service.assertSupplierInvited(id, user.supplierId);
    } catch (error) {
      return handleError(res, error, "Failed to upload file");
    }
    return handleResponseFileUpload(req, res);
  },
);

export const rfiController = router;
