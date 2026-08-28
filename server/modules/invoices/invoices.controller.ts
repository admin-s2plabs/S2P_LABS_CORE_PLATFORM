import { Router } from "express";
import * as service from "./invoices.service";
import { logAudit } from "../administration/administration.service";
import { upload, validateUploadedFile } from "../_shared/file-upload";
import { getTenantDomain } from "../_shared/db";
import { rewrapTenantContext } from "../../tenant-context";
import { streamFileFromAzure } from "../../services/azure-blob.service";
import { analyzeInvoiceMatch } from "../../services/invoice-match-service";
import { analyzeInvoiceFraud } from "../../services/invoice-fraud-service";
import { resolveRequestUser } from "../_shared/auth";

const router = Router();

function handleError(res: any, error: any, fallbackMessage: string) {
  if (error?.status) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(fallbackMessage + ":", error);
  res.status(500).json({ error: error?.message || fallbackMessage });
}

const getUserInfo = (req: any) => {
  const user = resolveRequestUser(req);
  return {
    email: user?.userName || "system",
    userId: user?.id || "0",
    fullName: user?.name || "System",
    orgId: user?.orgId ,
    supplierId: user?.supplierId,
  };
};

const audit = (userId: string, fullName: string, action: string, key: string, message: string) => {
  logAudit({
    userId,
    fullName,
    auditAction: action,
    auditKey: key,
    auditMessage: message,
    module: "INVOICES",
  }).catch((err) => console.error("Audit log error:", err));
};

router.get("/api/invoices/stats", async (req, res) => {
  try {
    const sessionUser = resolveRequestUser(req);
    const result = await service.getInvoiceStats(sessionUser);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to get invoice stats");
  }
});

router.get("/api/invoices/mention-search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(Number(req.query.limit) || 8, 20);
    const sessionUser = resolveRequestUser(req);
    if (!sessionUser?.id) return res.json({ invoices: [] });
    const result = await service.getInvoices(
      { page: "1", limit: String(limit), ...(q ? { search: q } : {}) },
      sessionUser,
    );
    const rows: any[] = (result as any).data || [];
    const invoices = rows
      .map((row: any) => ({
        invoiceId: String(row.id || ""),
        invoiceNumber: String(row.invoice_number || ""),
        invoiceStatus: row.invoice_status ? String(row.invoice_status) : null,
        supplierName: row.supplier_name ? String(row.supplier_name) : null,
        poNumber: row.po_number ? String(row.po_number) : null,
      }))
      .filter((inv) => inv.invoiceNumber.length > 0 && inv.invoiceId.length > 0);
    res.json({ invoices });
  } catch (error) {
    console.error("Failed to search invoices for mention:", error);
    res.status(500).json({ error: "Failed to search invoices" });
  }
});

router.get("/api/invoices", async (req, res) => {
  try {
    const sessionUser = resolveRequestUser(req);
    const result = await service.getInvoices(req.query, sessionUser);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to get invoices");
  }
});

router.get("/api/invoices/check-duplicate", async (req, res) => {
  try {
    const invoiceNumber = req.query.invoice_number as string;
    if (!invoiceNumber) {
      res.json({ duplicate: false });
      return;
    }
    const user = (req as any).user;
    const orgId = user?.org_id ? Number(user.org_id) : undefined;
    const existing = await service.checkDuplicateInvoiceNumber(invoiceNumber, isNaN(orgId as any) ? undefined : orgId);
    if (existing) {
      res.json({ duplicate: true, invoice: { id: existing.id, invoice_number: existing.invoice_number, supplier_name: existing.supplier_name, invoice_status: existing.invoice_status } });
    } else {
      res.json({ duplicate: false });
    }
  } catch (error: any) {
    console.error("Error checking duplicate invoice:", error);
    res.status(500).json({ error: "Failed to check duplicate" });
  }
});

router.get("/api/invoices/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const invoice = await service.getInvoiceById(id);
    res.json(invoice);
  } catch (error: any) {
    console.error("Error getting invoice:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to get invoice" });
  }
});

router.get("/api/invoices/:id/lines", async (req, res) => {
  try {
    const id = req.params.id;
    const lines = await service.getInvoiceLines(id);
    res.json(lines);
  } catch (error: any) {
    console.error("Error getting invoice lines:", error);
    res.status(500).json({ error: "Failed to get invoice lines" });
  }
});

router.post("/api/invoices/non-po", upload.array("invDocFiles", 10), rewrapTenantContext, async (req, res) => {
  try {
    const { email, userId, fullName, orgId } = getUserInfo(req);
    const user = (req as any).user || (req as any).session?.user;
    const userName = user?.userName || user?.user_name || email;

    const invoiceData = typeof req.body.invoiceData === "string"
      ? JSON.parse(req.body.invoiceData)
      : req.body.invoiceData || {};

    const invLines = typeof req.body.invLines === "string"
      ? JSON.parse(req.body.invLines)
      : req.body.invLines || [];

    const files = (req.files as Express.Multer.File[]) || [];

    for (const file of files) {
      const validation = validateUploadedFile(file);
      if (!validation.valid) {
        res.status(400).json({ error: `Invalid file "${file.originalname}": ${validation.error}` });
        return;
      }
    }

    let docPreviews: (string | null)[] = [];
    try {
      docPreviews = JSON.parse(req.body.docPreviews || "[]");
    } catch { docPreviews = []; }

    const result = await service.processNonPOInvoice(
      invoiceData,
      invLines,
      files,
      { email, userId, fullName, orgId: Number(orgId), userName },
      docPreviews,
      getTenantDomain(req) ?? undefined
    );

    res.json(result);
    audit(userId, fullName, "CREATE", String(result.invoiceId), `NON-PO Invoice ${invoiceData.invoice_number} raised and submitted for approval`);
  } catch (error: any) {
    console.error("Error processing NON-PO invoice:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to process NON-PO invoice" });
  }
});

router.post("/api/invoices/raise-po-advance", upload.array("invDocFiles", 10), rewrapTenantContext, async (req, res) => {
  try {
    const { email, userId, fullName, orgId } = getUserInfo(req);
    const user = (req as any).user || (req as any).session?.user;
    const userName = user?.userName || user?.user_name || email;

    const invoiceData = typeof req.body.invoiceData === "string"
      ? JSON.parse(req.body.invoiceData)
      : req.body.invoiceData || {};

    const files = (req.files as Express.Multer.File[]) || [];

    // Validate required invoice data
    if (!invoiceData.invoice_number || invoiceData.invoice_number.trim() === "") {
      res.status(400).json({ error: "Invoice number is required" });
      return;
    }

    if (!invoiceData.po_number || invoiceData.po_number.trim() === "") {
      res.status(400).json({ error: "PO number is required" });
      return;
    }

    if (!invoiceData.invoice_amount || isNaN(parseFloat(invoiceData.invoice_amount))) {
      res.status(400).json({ error: "Valid invoice amount is required" });
      return;
    }

    // Validate uploaded files
    for (const file of files) {
      const validation = validateUploadedFile(file);
      if (!validation.valid) {
        res.status(400).json({ error: `Invalid file "${file.originalname}": ${validation.error}` });
        return;
      }
    }

    let docPreviews: (string | null)[] = [];
    try {
      docPreviews = JSON.parse(req.body.docPreviews || "[]");
    } catch { docPreviews = []; }

    const result = await service.processPoAdvanceInvoice(
      invoiceData,
      files,
      { email, userId, fullName, orgId: Number(orgId), userName },
      docPreviews
    );

    res.json(result);
    audit(userId, fullName, "CREATE", String(result.invoiceId), `PO Advance Invoice ${invoiceData.invoice_number} for PO ${invoiceData.po_number} raised and submitted for approval`);
  } catch (error: any) {
    console.error("Error processing PO advance invoice:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to process PO advance invoice" });
  }
});

router.post("/api/invoices", async (req, res) => {
  try {
    const { email, userId, fullName, orgId } = getUserInfo(req);
    const result = await service.createInvoice({
      ...req.body,
      created_by: email,
      org_id: orgId,
    });
    res.json(result);
    audit(userId, fullName, "CREATE", String(result.id), `Invoice ${result.invoice_number} created`);
  } catch (error: any) {
    console.error("Error creating invoice:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to create invoice" });
  }
});

router.put("/api/invoices/:id", upload.array("invDocFiles", 10), rewrapTenantContext, async (req, res) => {
  try {
    const id = req.params.id;
    const { email, userId, fullName } = getUserInfo(req);

    const invoiceData = typeof req.body.invoiceData === "string"
      ? JSON.parse(req.body.invoiceData)
      : req.body || {};

    let docPreviews: (string | null)[] = [];
    try {
      docPreviews = JSON.parse(req.body.docPreviews || "[]");
    } catch { docPreviews = []; }

    const files = (req.files as Express.Multer.File[]) || [];
    for (const file of files) {
      const validation = validateUploadedFile(file);
      if (!validation.valid) {
        res.status(400).json({ error: `Invalid file "${file.originalname}": ${validation.error}` });
        return;
      }
    }

    const result = await service.updateInvoice(
      id,
      { ...invoiceData, last_modified_by: email },
      files,
      docPreviews,
      getTenantDomain(req) ?? undefined
    );

    res.json(result);
    audit(userId, fullName, "UPDATE", String(id), `Invoice ${result.invoice_number} updated`);
  } catch (error: any) {
    console.error("Error updating invoice:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to update invoice" });
  }
});

router.delete("/api/invoices/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { userId, fullName } = getUserInfo(req);
    const result = await service.deleteInvoice(id);
    res.json({ success: true });
    audit(userId, fullName, "DELETE", String(id), `Invoice ${result.invoice_number} deleted`);
  } catch (error: any) {
    console.error("Error deleting invoice:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to delete invoice" });
  }
});

router.post("/api/invoices/:id/submit", async (req, res) => {
  try {
    const id = req.params.id;
    const { email, userId, fullName,orgId } = getUserInfo(req);
    const tenant = getTenantDomain(req) ?? undefined;
    const userName = email;
    const result = await service.submitInvoice(id, email,{ email, userId, fullName, orgId: Number(orgId),userName},tenant);
    res.json(result);
    audit(userId, fullName, "UPDATE", String(id), `Invoice ${result.invoice_number} submitted for approval`);
  } catch (error: any) {
    console.error("Error submitting invoice:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to submit invoice" });
  }
});

router.post("/api/invoices/:id/approve", async (req, res) => {
  try {
    const id = req.params.id;
    const { email, userId, fullName } = getUserInfo(req);
    const result = await service.approveInvoice(id, email);
    res.json(result);
    audit(userId, fullName, "UPDATE", String(id), `Invoice ${result.invoice_number} approved`);
  } catch (error: any) {
    console.error("Error approving invoice:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to approve invoice" });
  }
});

router.post("/api/invoices/:id/reject", async (req, res) => {
  try {
    const id = req.params.id;
    const { email, userId, fullName } = getUserInfo(req);
    const result = await service.rejectInvoice(id, email, req.body.reason || "");
    res.json(result);
    audit(userId, fullName, "UPDATE", String(id), `Invoice ${result.invoice_number} rejected`);
  } catch (error: any) {
    console.error("Error rejecting invoice:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to reject invoice" });
  }
});

router.put("/api/invoices/:invoiceId/update-tax-included", async (req, res) => {
  try {
    const invoiceId = req.params.invoiceId;
    const { userId, fullName } = getUserInfo(req);
    const result = await service.updateTaxIncluded(invoiceId, req.body.taxIncluded);
    res.json(result);
    audit(userId, fullName, "UPDATE", String(invoiceId), `Invoice ${invoiceId} tax included updated`);
  } catch (error: any) {
    console.error("Error updating tax included:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to update tax included" });
  }
});

router.post("/api/invoices/:id/process-approval", async (req, res) => {
  try {
    const id = req.params.id;
    const { userId, fullName } = getUserInfo(req);
    const user = (req as any).user || req.session?.user;
    const result = await service.processInvoiceApproval(id, req.body, user);
    res.json(result);
    audit(userId, fullName, "APPROVAL", String(id), `Invoice approval processed: ${req.body.result}`);
  } catch (error: any) {
    console.error("Error processing invoice approval:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to process invoice approval" });
  }
});

router.post("/api/invoices/:id/lines", async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const { email, userId, fullName, orgId } = getUserInfo(req);
    const result = await service.createInvoiceLine({
      ...req.body,
      invoice_id: invoiceId,
      created_by: email,
      org_id: orgId,
    });
    res.json(result);
    audit(userId, fullName, "CREATE", String(result.id), `Invoice line item added to invoice ${invoiceId}`);
  } catch (error: any) {
    console.error("Error creating invoice line:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to create invoice line" });
  }
});

router.put("/api/invoices/:id/lines/:lineId", async (req, res) => {
  try {
    const lineId = parseInt(req.params.lineId);
    const { email, userId, fullName } = getUserInfo(req);
    const result = await service.updateInvoiceLine(lineId, {
      ...req.body,
      last_modified_by: email,
    });
    res.json(result);
    audit(userId, fullName, "UPDATE", String(lineId), `Invoice line item ${lineId} updated`);
  } catch (error: any) {
    console.error("Error updating invoice line:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to update invoice line" });
  }
});

router.delete("/api/invoices/:id/lines/:lineId", async (req, res) => {
  try {
    const lineId = parseInt(req.params.lineId);
    const invoiceId = req.params.id;
    const { userId, fullName } = getUserInfo(req);
    const result = await service.deleteInvoiceLine(lineId, invoiceId);
    
    res.json({ success: true });
    audit(userId, fullName, "DELETE", String(lineId), `Invoice line item ${lineId} deleted`);
  } catch (error: any) {
    console.error("Error deleting invoice line:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to delete invoice line" });
  }
});

router.get("/api/invoices/:id/bank-details", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await service.getVendorBankDetails(id);
    res.json(result);
  } catch (error: any) {
    console.error("Error getting bank details:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to get bank details" });
  }
});

router.post("/api/invoices/:id/pay", async (req, res) => {
  try {
    const id = req.params.id;
    const { email, userId, fullName } = getUserInfo(req);
    const result = await service.processPayment(id, req.body, email);
    res.json(result);
    audit(userId, fullName, "UPDATE", String(id), `Invoice ${result.invoice_number} marked as paid`);
  } catch (error: any) {
    console.error("Error processing payment:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to process payment" });
  }
});

router.get("/api/invoices/:id/payment-record", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await service.getPaymentRecord(id);
    res.json(result || null);
  } catch (error: any) {
    console.error("Error getting payment record:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to get payment record" });
  }
});

router.get("/api/invoices/:id/documents", rewrapTenantContext, async (req, res) => {
  try {
    const id = req.params.id;
    const source = req.query.source as string | undefined;
    const result = await service.getInvoiceDocuments(id, source);
    res.json(result);
  } catch (error: any) {
    console.error("Error fetching invoice documents:", error);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

router.post("/api/invoices/:id/documents", upload.single("file"), rewrapTenantContext, async (req, res) => {
  try {
    const id = req.params.id;
    const { email, userId, fullName } = getUserInfo(req);
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "No file provided" });
    const result = await service.addInvoiceDocument(id, file, email, getTenantDomain(req) ?? undefined);
    res.status(201).json({ id: result });
    audit(userId, fullName, "CREATE", String(id), `Document added to invoice ${id}`);
  } catch (error: any) {
    console.error("Error adding invoice document:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to add document" });
  }
});

router.get("/api/invoices/:id/documents/:docId/download", rewrapTenantContext, async (req, res) => {
  try {
    const docId = parseInt(req.params.docId);
    const { blobUrl, mimeType, filename } = await service.downloadInvoiceDocument(docId);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    await streamFileFromAzure(blobUrl, res);
  } catch (error: any) {
    console.error("Error downloading collaboration document:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to download document" });
  }
});

router.delete("/api/invoices/:id/documents/:docId", rewrapTenantContext, async (req, res) => {
  try {
    const id = req.params.id;
    const docId = parseInt(req.params.docId);
    const { userId, fullName } = getUserInfo(req);
    await service.deleteInvoiceDocument(id, docId);
    res.json({ success: true });
    audit(userId, fullName, "DELETE", String(id), `Document ${docId} deleted from invoice ${id}`);
  } catch (error: any) {
    console.error("Error deleting invoice document:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

router.get("/api/invoices/:id/comments", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await service.getInvoiceComments(id);
    res.json(result);
  } catch (error: any) {
    console.error("Error fetching invoice comments:", error);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

router.post("/api/invoices/:id/comments", async (req, res) => {
  try {
    const id = req.params.id;
    const { email, fullName, userId } = getUserInfo(req);
    const result = await service.addInvoiceComment(id, {
      ...req.body,
      created_by: email,
      created_by_name: fullName,
    });
    res.status(201).json({ id: result });
    audit(userId, fullName, "CREATE", String(id), `Comment added to invoice ${id}`);
  } catch (error: any) {
    console.error("Error adding invoice comment:", error);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

router.delete("/api/invoices/:id/comments/:commentId", async (req, res) => {
  try {
    const id = req.params.id;
    const commentId = parseInt(req.params.commentId);
    const { userId, fullName } = getUserInfo(req);
    await service.deleteInvoiceComment(id, commentId);
    res.json({ success: true });
    audit(userId, fullName, "DELETE", String(id), `Comment ${commentId} deleted from invoice ${id}`);
  } catch (error: any) {
    console.error("Error deleting invoice comment:", error);
    res.status(500).json({ error: "Failed to delete comment" });
  }
});

router.get("/api/invoices/:id/notes", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await service.getInvoiceNotes(id);
    res.json(result);
  } catch (error: any) {
    console.error("Error fetching invoice notes:", error);
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

router.put("/api/invoices/:id/notes", async (req, res) => {
  try {
    const id = req.params.id;
    const { userId, fullName } = getUserInfo(req);
    const result = await service.updateInvoiceNotes(id, req.body.notes);
    res.json(result);
    audit(userId, fullName, "UPDATE", String(id), `Invoice ${id} notes updated`);
  } catch (error: any) {
    console.error("Error updating invoice notes:", error);
    res.status(500).json({ error: "Failed to update notes" });
  }
});

router.get("/api/invoices/:id/approval-history", async (req, res) => {
  try {
    const id =req.params.id;
    const result = await service.getInvoiceApprovalHistory(id);
    res.json(result);
  } catch (error: any) {
    console.error("Error fetching invoice approval history:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to fetch approval history" });
  }
});

router.get("/api/invoices/documents/:docId/download", async (req, res) => {
  try {
    const docId = parseInt(req.params.docId);
    const { blobUrl, mimeType, filename } = await service.downloadInvoiceDocument(docId);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    await streamFileFromAzure(blobUrl, res);
  } catch (error: any) {
    console.error("Error downloading invoice document:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to download document" });
  }
});

router.post("/api/invoices/:id/ai-match", async (req, res) => {
  try {
    const id = req.params.id;
    const { userId, fullName } = getUserInfo(req);
    const result = await analyzeInvoiceMatch(id);
    res.json(result);
    audit(userId, fullName, "AI_MATCH", String(id), `AI invoice matching analysis performed for invoice ${id}`);
  } catch (error: any) {
    console.error("Error performing AI invoice match:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to perform AI invoice matching" });
  }
});

router.post("/api/invoices/:id/ai-fraud-check", async (req, res) => {
  try {
    const id = req.params.id;
    const { userId, fullName } = getUserInfo(req);
    const result = await analyzeInvoiceFraud(id);
    res.json(result);
    audit(userId, fullName, "AI_FRAUD_CHECK", String(id), `AI fraud detection analysis performed for invoice ${id}`);
  } catch (error: any) {
    console.error("Error performing AI fraud check:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to perform AI fraud analysis" });
  }
});

router.get("/api/invoicesandlines/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const invoice = await service.getInvoiceById(id);
    const lines = await service.getInvoiceLines(id);
    invoice.lines = lines;
    res.json({ invoice});
  } catch (error: any) {
    console.error("Error getting invoice lines:", error);
    res.status(500).json({ error: "Failed to get invoice lines" });
  }
});
export const invoicesController = router;
