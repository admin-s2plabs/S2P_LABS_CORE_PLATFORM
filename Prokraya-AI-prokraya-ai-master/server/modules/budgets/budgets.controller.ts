import { Router } from "express";
import * as service from "./budgets.service";
import { logAudit } from "../administration/administration.service";
import { upload } from "../_shared/file-upload";
import { getTenantDomain } from "../_shared/db";
import { streamFileFromAzure } from "../../services/azure-blob.service";
import { rewrapTenantContext } from "../../tenant-context";

const router = Router();

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

router.get("/api/budgets", async (req, res) => {
  try {
    const exportLinesRaw = req.query.exportLines;
    const exportLines =
      exportLinesRaw === "true" || exportLinesRaw === "1" || exportLinesRaw === "yes";
    const result = await service.listBudgets({
      status: req.query.status as string,
      search: req.query.search as string,
      year: req.query.year as string,
      page: (req.query.page as string) || "1",
      limit: (req.query.limit as string) || "50",
      exportLines,
    });
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch budgets");
  }
});


router.get("/api/budgets/stats", async (req, res) => {
  try {
    const result = await service.getStats(req.query.year as string);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch budget stats");
  }
});

router.get("/api/budgets/periods", async (req, res) => {
  try {
    const result = await service.getPeriods();
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch periods");
  }
});

router.get("/api/budgets/users", async (req, res) => {
  try {
    const result = await service.getUsers();
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch users");
  }
});

router.get("/api/budgets/entities", async (req, res) => {
  try {
    const result = await service.getEntities();
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch entities");
  }
});

router.post("/api/budgets/create-with-ai", async (req, res) => {
  try {
    const reqUser = (req as any).user;
    if (!reqUser) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const result = await service.createBudgetWithAI(req.body.prompt, reqUser, {
      businessEntityId: req.body.businessEntityId ?? null,
    });
    res.json(result);
    if (!result.needsClarification && result.id) {
      audit(req, String(result.id), "CREATE", "Budget created with AI", "BUDGETS");
    }
  } catch (error: any) {
    handleError(res, error, "Failed to create budget with AI");
  }
});

router.get("/api/budgets/suggest-amount/:costCenterCode", async (req, res) => {
  try {
    const currency =
      typeof req.query.currency === "string" && req.query.currency.trim()
        ? req.query.currency.trim()
        : undefined;
    const periodMstId =
      typeof req.query.periodMstId === "string" && req.query.periodMstId.trim()
        ? req.query.periodMstId.trim()
        : undefined;
    const startDate =
      typeof req.query.startDate === "string" && req.query.startDate.trim()
        ? req.query.startDate.trim()
        : undefined;
    const endDate =
      typeof req.query.endDate === "string" && req.query.endDate.trim()
        ? req.query.endDate.trim()
        : undefined;
    const businessEntity =
      typeof req.query.businessEntity === "string" && req.query.businessEntity.trim()
        ? req.query.businessEntity.trim()
        : undefined;

    const parseIdList = (value: unknown): number[] | undefined => {
      if (typeof value !== "string" || !value.trim()) return undefined;
      const ids = value
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((n) => Number.isFinite(n));
      return ids.length > 0 ? ids : undefined;
    };

    const locationIds = parseIdList(req.query.locationIds);
    const departmentIds = parseIdList(req.query.departmentIds);

    const result = await service.suggestAmount(req.params.costCenterCode, {
      currency,
      periodMstId,
      startDate,
      endDate,
      businessEntity,
      locationIds,
      departmentIds,
    });
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch amount suggestion");
  }
});

router.post("/api/budgets", async (req, res) => {
  try {
    const result = await service.createBudgetDraft(req.body, (req as any).user?.userName || 'system');
    res.status(201).json(result);
    audit(req, String(result.id), "CREATE", "Budget draft created", "BUDGETS");
  } catch (error) {
    handleError(res, error, "Failed to create budget");
  }
});

router.put("/api/budgets/:id", async (req, res) => {
  try {
    await service.updateBudget(req.params.id, req.body, (req as any).user?.userName || 'system');
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Budget updated", "BUDGETS");
  } catch (error) {
    handleError(res, error, "Failed to update budget");
  }
});

router.delete("/api/budgets/:id", async (req, res) => {
  try {
    await service.deleteBudgetById(req.params.id);
    res.json({ success: true });
    audit(req, req.params.id, "DELETE", "Budget deleted", "BUDGETS");
  } catch (error) {
    handleError(res, error, "Failed to delete budget");
  }
});

router.post("/api/budgets/:id/submit", async (req, res) => {
  try {
    const result = await service.submitBudget(req.params.id, (req as any).user);
    res.json(result);
    audit(req, req.params.id, "SUBMIT", "Budget submitted for approval", "BUDGETS");
  } catch (error: any) {
    handleError(res, error, "Failed to submit budget for approval");
  }
});

router.post("/api/budgets/:id/copy", async (req, res) => {
  try {
    const reqUser = (req as any).user;
    if (!reqUser) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const result = await service.copyBudget(req.params.id, reqUser);
    res.json(result);
    audit(req, req.params.id, "CREATE", "Budget copied", "BUDGETS");
  } catch (error: any) {
    handleError(res, error, "Failed to copy budget");
  }
});

router.post("/api/budgets/:budgetId/process-approval", async (req, res) => {
  try {
    const reqUser = (req as any).user;
    if (!reqUser) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const result = await service.processApproval(req.params.budgetId, req.body, reqUser);
    res.json(result);
    audit(req, req.params.budgetId, "APPROVAL", "Budget approval processed", "BUDGETS");
  } catch (error: any) {
    handleError(res, error, "Failed to process budget approval");
  }
});

router.get("/api/budgets/cost-centers", async (req, res) => {
  try {
    const result = await service.getCostCenters();
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch cost centers");
  }
});

router.get("/api/budgets/approved-lines", async (req, res) => {
  try {
    const result = await service.getApprovedLines();
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch approved budget lines");
  }
});

router.get("/api/budgets/locations", async (req, res) => {
  try {
    const businessEntityId = req.query.businessEntityId as string | undefined;
    const result = await service.getLocations(businessEntityId);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch locations");
  }
});

router.get("/api/budgets/departments", async (req, res) => {
  try {
    const result = await service.getDepartments();
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch departments");
  }
});

router.post("/api/budgets/:id/lines", async (req, res) => {
  try {
    const result = await service.addLine(req.params.id, req.body);
    res.status(201).json(result);
    audit(req, req.params.id, "CREATE", "Budget line added", "BUDGETS");
  } catch (error) {
    handleError(res, error, "Failed to add budget line");
  }
});

router.put("/api/budgets/:id/lines/:lineId", async (req, res) => {
  try {
    await service.updateLine(req.params.id, req.params.lineId, req.body);
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Budget line updated", "BUDGETS");
  } catch (error) {
    handleError(res, error, "Failed to update budget line");
  }
});

router.delete("/api/budgets/:id/lines/:lineId", async (req, res) => {
  try {
    await service.deleteLine(req.params.id, req.params.lineId);
    res.json({ success: true });
    audit(req, req.params.id, "DELETE", "Budget line deleted", "BUDGETS");
  } catch (error) {
    handleError(res, error, "Failed to delete budget line");
  }
});

router.post("/api/budgets/:id/lines/:lineId/copy", async (req, res) => {
  try {
    const result = await service.copyLine(req.params.id, req.params.lineId);
    res.status(201).json(result);
    audit(req, req.params.id, "CREATE", "Budget line copied", "BUDGETS");
  } catch (error) {
    handleError(res, error, "Failed to copy budget line");
  }
});

router.get("/api/budgets/:id/documents", rewrapTenantContext, async (req, res) => {
  try {
    const result = await service.getDocuments(req.params.id);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch documents");
  }
});

router.post("/api/budgets/:id/documents", upload.single("file"), rewrapTenantContext, async (req, res) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "No file provided" });
    const user = (req as any).user || (req as any).session?.user;
    const createdBy = user?.userName || user?.user_name || "system";
    const result = await service.addDocument(req.params.id, file, createdBy, getTenantDomain(req) ?? undefined);
    res.status(201).json(result);
    audit(req, req.params.id, "CREATE", "Budget document added", "BUDGETS");
  } catch (error) {
    handleError(res, error, "Failed to add document");
  }
});

router.get("/api/budgets/:id/documents/:docId/download", rewrapTenantContext, async (req, res) => {
  try {
    const { blobUrl, mimeType, filename } = await service.downloadCollaborationDocument(req.params.docId);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    await streamFileFromAzure(blobUrl, res);
  } catch (error) {
    handleError(res, error, "Failed to download document");
  }
});

router.delete("/api/budgets/:id/documents/:docId", rewrapTenantContext, async (req, res) => {
  try {
    await service.deleteDocument(req.params.id, req.params.docId);
    res.json({ success: true });
    audit(req, req.params.id, "DELETE", "Budget document deleted", "BUDGETS");
  } catch (error) {
    handleError(res, error, "Failed to delete document");
  }
});

router.get("/api/budgets/:id/notes", async (req, res) => {
  try {
    const result = await service.getNotes(req.params.id);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch notes");
  }
});

router.put("/api/budgets/:id/notes", async (req, res) => {
  try {
    await service.updateNotes(req.params.id, req.body.notes);
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Budget notes updated", "BUDGETS");
  } catch (error) {
    handleError(res, error, "Failed to update notes");
  }
});

router.get("/api/budgets/:id/comments", async (req, res) => {
  try {
    const result = await service.getComments(req.params.id);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch comments");
  }
});

router.post("/api/budgets/:id/comments", async (req, res) => {
  try {
    const user = (req as any).user;
    const result = await service.addComment(req.params.id, req.body, user);
    res.status(201).json(result);
    audit(req, req.params.id, "CREATE", "Budget comment added", "BUDGETS");
  } catch (error) {
    handleError(res, error, "Failed to add comment");
  }
});

router.delete("/api/budgets/:id/comments/:commentId", async (req, res) => {
  try {
    await service.deleteComment(req.params.id, req.params.commentId);
    res.json({ success: true });
    audit(req, req.params.id, "DELETE", "Budget comment deleted", "BUDGETS");
  } catch (error) {
    handleError(res, error, "Failed to delete comment");
  }
});

router.get("/api/budgets/bulk-import/template", async (req, res) => {
  try {
    const buffer = await service.downloadBulkImportTemplate();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="budget_import_template.xlsx"');
    res.send(buffer);
  } catch (error) {
    handleError(res, error, "Failed to generate import template");
  }
});

router.post("/api/budgets/bulk-import/validate", upload.single("file"), async (req, res) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "No file provided" });
    const result = await service.validateBulkImport(file);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to validate import file");
  }
});

router.post("/api/budgets/bulk-import", upload.single("file"), async (req, res) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "No file provided" });
    const user = (req as any).user;
    const result = await service.bulkImportBudgets(file, user);
    res.status(201).json(result);
    audit(req, "bulk-import", "CREATE", `Bulk import: ${result.created} budgets created, ${result.errors} failed`, "BUDGETS");
  } catch (error) {
    handleError(res, error, "Failed to bulk import budgets");
  }
});

router.get("/api/budgets/:id/lines/bulk-import/template", async (req, res) => {
  try {
    const buffer = await service.downloadBudgetLinesTemplate(req.params.id);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="budget_lines_import_template.xlsx"');
    res.send(buffer);
  } catch (error) {
    handleError(res, error, "Failed to generate import template");
  }
});

router.post("/api/budgets/:id/lines/bulk-import/validate", upload.single("file"), async (req, res) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "No file provided" });
    const result = await service.validateBulkLinesImport(req.params.id, file);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to validate import file");
  }
});

router.post("/api/budgets/:id/lines/bulk-import", upload.single("file"), async (req, res) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "No file provided" });
    const user = (req as any).user;
    const result = await service.bulkImportBudgetLines(req.params.id, file, user);
    res.status(201).json(result);
    audit(req, "bulk-import-lines", "CREATE", `Bulk import: ${result.created} lines created, ${result.errors} failed`, "BUDGETS");
  } catch (error) {
    handleError(res, error, "Failed to bulk import budget lines");
  }
});

router.get("/api/budgets/:id", async (req, res) => {
  try {
    const result = await service.getBudgetDetail(req.params.id);
    if (!result) {
      return res.status(404).json({ error: "Budget not found" });
    }
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch budget details");
  }
});

export const budgetsController = router;
