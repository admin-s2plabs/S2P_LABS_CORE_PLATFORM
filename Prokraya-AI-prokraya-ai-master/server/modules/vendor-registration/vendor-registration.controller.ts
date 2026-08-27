import { Router } from "express";
import * as fs from "fs";
import * as path from "path";
import { upload, sanitizeFilename, validateUploadedFile } from "../_shared";
import { getTenantDomain } from "../_shared/db";
import { streamFileFromAzure } from "../../services/azure-blob.service";
import * as service from "./vendor-registration.service";
import { logAudit } from "../administration/administration.service";
import { processVendorRegistrationChat, extractDocumentData } from "../../services/vendor-registration-agent-service";
import { rewrapTenantContext } from "../../tenant-context";
import { extractStructuredDocument } from "../../services/vendor-registration-extraction";
import {
  applyLookupResolutionsToExtracted,
  buildAssistantSummary,
  computeMissingMandatory,
  emptyDraftSession,
  mergeExtractionIntoDraft,
  type LookupBundle,
  type VendorRegistrationDraftSession,
} from "../../services/vendor-registration-draft-merge";
import { deleteDraftBackup } from "./vendor-registration.repository";

async function deDuplicateCertificate(sessionUser: any, req: any, certDocType: string) {
  if (!certDocType || certDocType === "other") return;

  // 1. De-duplicate in pending session documents
  const pendingDocs = (req as any).session?.pendingAiDocuments || [];
  const nextPending: any[] = [];
  for (const doc of pendingDocs) {
    if (doc.docType === certDocType) {
      try {
        if (doc.tempPath && fs.existsSync(doc.tempPath)) {
          fs.unlinkSync(doc.tempPath);
        }
      } catch (err: any) {
        console.error("[deDuplicateCertificate] Failed to unlink temp file:", err?.message);
      }
    } else {
      nextPending.push(doc);
    }
  }
  (req as any).session.pendingAiDocuments = nextPending;

  // 2. De-duplicate in committed database documents (if supplierId exists)
  if (sessionUser?.supplierId) {
    try {
      const existingDocs = await service.getDocuments(sessionUser);
      for (const doc of existingDocs) {
        if (doc.doc_type === certDocType && (doc.status === "Active" || !doc.status)) {
          console.log(`[deDuplicateCertificate] Soft deleting existing database document id=${doc.id} of type=${certDocType}`);
          await service.deleteDocument(sessionUser, String(doc.id));
        }
      }
    } catch (err: any) {
      console.error("[deDuplicateCertificate] Failed to soft delete database document:", err?.message);
    }
  }
}

function clearDraftFieldsForDocType(
  draft: VendorRegistrationDraftSession,
  docType: string
): VendorRegistrationDraftSession {
  const t = String(docType ?? "").toLowerCase();
  let keys: string[] = [];
  let preferredSection: "company" | "banking" = "company";

  if (t.includes("bank") || t.includes("cheque")) {
    keys = ["beneficiary_name", "bank_name", "branch_name", "account_no", "ifsccode", "swift_code", "bank_account_type"];
    preferredSection = "banking";
  } else if (t.includes("gst") || t.includes("tax") || t.includes("vat")) {
    keys = ["tax_reg_no", "tax_payer_id", "tax_effective_date", "state"];
    preferredSection = "company";
  } else if (t.includes("license") || t.includes("trade")) {
    keys = ["license_no", "expiry_date", "place_of_issue", "start_date"];
    preferredSection = "company";
  } else {
    keys = ["type_of_company", "legal_entity_type", "pan_no", "start_date", "address_1", "city", "state", "country", "postalcode", "phone", "email_id", "web_address"];
    preferredSection = "company";
  }

  const nextCompany = { ...draft.company };
  const nextBanking = { ...draft.banking };
  const nextFieldMeta = { ...draft.fieldMeta };

  keys.forEach((key) => {
    if (preferredSection === "banking") {
      delete nextBanking[key];
      delete nextFieldMeta[`banking.${key}`];
    } else {
      delete nextCompany[key];
      delete nextFieldMeta[`company.${key}`];
    }
  });

  return {
    ...draft,
    company: nextCompany,
    banking: nextBanking,
    fieldMeta: nextFieldMeta,
  };
}

const router = Router();

function handleError(res: any, error: any, fallbackMessage: string) {
  if (error?.status) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(fallbackMessage + ":", error);
  res.status(500).json({ error: fallbackMessage });
}

function audit(req: any, auditKey: string, auditAction: string, auditMessage: string, module: string) {
  const user = (req as any).user || (req as any).session?.user;
  logAudit({
    auditKey,
    auditAction,
    auditMessage,
    fullName: user?.name || user?.userName || "System",
    userId: user?.id || user?.userName || "system",
    module,
  }).catch((err: any) => console.error("[Audit] Failed to log:", err?.message));
}

router.get("/api/vendor/profile", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.getProfile(sessionUser);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch vendor profile");
  }
});

router.get("/api/vendor/status", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.getStatus(sessionUser);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch vendor status");
  }
});

router.patch("/api/vendor/profile/company-details", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.saveCompanyDetails(sessionUser, req.body, req);
    const userAfter = (req as any).session?.user;
    if (userAfter?.supplierId && (req as any).session.pendingAiDocuments?.length > 0) {
      await savePendingDocuments(userAfter, req);
    }
    res.json(result);
    audit(req, "supplier-profile", "UPDATE", "Company details updated", "VENDOR_REGISTRATION");
  } catch (error: any) {
    handleError(res, error, "Failed to save company details");
  }
});

router.get("/api/vendor/lookups/:type", async (req, res) => {
  try {
    const result = await service.getLookup(req.params.type);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch lookup data");
  }
});

router.get("/api/vendor/contacts", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.getContacts(sessionUser);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch contacts");
  }
});

router.post("/api/vendor/contacts", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.createContact(sessionUser, req.body);
    res.json(result);
    audit(req, String(result.id || "contact"), "CREATE", "Supplier contact created", "VENDOR_REGISTRATION");
  } catch (error: any) {
    handleError(res, error, "Failed to create contact");
  }
});

router.patch("/api/vendor/contacts/:id", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.updateContact(sessionUser, req.params.id, req.body);
    res.json(result);
    audit(req, req.params.id, "UPDATE", "Supplier contact updated", "VENDOR_REGISTRATION");
  } catch (error: any) {
    handleError(res, error, "Failed to update contact");
  }
});

router.delete("/api/vendor/contacts/:id", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.deleteContact(sessionUser, req.params.id);
    res.json(result);
    audit(req, req.params.id, "DELETE", "Supplier contact deleted", "VENDOR_REGISTRATION");
  } catch (error: any) {
    handleError(res, error, "Failed to delete contact");
  }
});

router.get("/api/vendor/bank-accounts", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.getBankAccounts(sessionUser);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch bank accounts");
  }
});

router.post("/api/vendor/bank-accounts", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.createBankAccount(sessionUser, req.body);
    res.json(result);
    audit(req, String(result.id || "bank"), "CREATE", "Bank account created", "VENDOR_REGISTRATION");
  } catch (error: any) {
    handleError(res, error, "Failed to create bank account");
  }
});

router.patch("/api/vendor/bank-accounts/:id", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const tenantPool = (req as any).tenantPool;
    const result = await service.updateBankAccount(sessionUser, req.params.id, req.body, tenantPool);
    res.json(result);
    audit(req, req.params.id, "UPDATE", "Bank account updated", "VENDOR_REGISTRATION");
  } catch (error: any) {
    handleError(res, error, "Failed to update bank account");
  }
});

router.delete("/api/vendor/bank-accounts/:id", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.deleteBankAccount(sessionUser, req.params.id);
    res.json(result);
    audit(req, req.params.id, "DELETE", "Bank account deleted", "VENDOR_REGISTRATION");
  } catch (error: any) {
    handleError(res, error, "Failed to delete bank account");
  }
});

router.get("/api/vendor/scope-of-supply", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.getScopeOfSupply(sessionUser);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch scope of supply");
  }
});

router.patch("/api/vendor/scope-of-supply/service-info", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.updateServiceInfo(sessionUser, req.body);
    res.json(result);
    audit(req, "scope", "UPDATE", "Service info updated", "VENDOR_REGISTRATION");
  } catch (error: any) {
    handleError(res, error, "Failed to update service info");
  }
});

router.post("/api/vendor/scope-of-supply/categories", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.addCategory(sessionUser, req.body);
    res.json(result);
    audit(req, String(result.id || "category"), "CREATE", "Supply category added", "VENDOR_REGISTRATION");
  } catch (error: any) {
    handleError(res, error, "Failed to add category");
  }
});

router.delete("/api/vendor/scope-of-supply/categories/:id", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.removeCategory(sessionUser, req.params.id);
    res.json(result);
    audit(req, req.params.id, "DELETE", "Supply category removed", "VENDOR_REGISTRATION");
  } catch (error: any) {
    handleError(res, error, "Failed to remove category");
  }
});

router.get("/api/vendor/categories", async (req, res) => {
  try {
    const { level, parent_code } = req.query;
    const result = await service.getVendorCategories(level as string | undefined, parent_code as string | undefined);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch categories");
  }
});

router.get("/api/vendor/documents", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.getDocuments(sessionUser);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch documents");
  }
});

router.post("/api/vendor/documents", rewrapTenantContext, upload.single("file"), async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const uploadedFile = (req as any).file as Express.Multer.File | undefined;
    if (req.body.doc_type && DOC_TYPE_MAP[req.body.doc_type]) {
      req.body.doc_type = DOC_TYPE_MAP[req.body.doc_type];
    }
    const tenantPool = (req as any).tenantPool;
    const result = await service.uploadDocument(sessionUser, req.body, uploadedFile, getTenantDomain(req) ?? undefined, tenantPool);
    res.json(result);
    audit(req, String(result.id || "doc"), "CREATE", "Supplier document uploaded", "VENDOR_REGISTRATION");
  } catch (error: any) {
    handleError(res, error, "Failed to create document");
  }
});

router.delete("/api/vendor/documents/:id", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.deleteDocument(sessionUser, req.params.id);
    res.json(result);
    audit(req, req.params.id, "DELETE", "Supplier document deleted", "VENDOR_REGISTRATION");
  } catch (error: any) {
    handleError(res, error, "Failed to delete document");
  }
});

router.patch("/api/vendor/documents/:id/link-bank", rewrapTenantContext, async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const tenantPool = (req as any).tenantPool;
    const bankId = req.body?.bank_id ?? req.body?.bankId;
    const result = await service.linkBankingDocumentToBankAccount(
      sessionUser,
      req.params.id,
      String(bankId),
      tenantPool,
    );
    res.json(result);
    audit(req, req.params.id, "UPDATE", "Bank document linked to account", "VENDOR_REGISTRATION");
  } catch (error: any) {
    handleError(res, error, "Failed to link bank document");
  }
});

router.get("/api/vendor/documents/:id/download", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const { blobUrl, mimeType, filename } = await service.downloadDocument(sessionUser, req.params.id);
    const isInline = req.query.inline === 'true';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `${isInline ? 'inline' : 'attachment'}; filename="${filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    await streamFileFromAzure(blobUrl, res);
  } catch (error: any) {
    handleError(res, error, "Failed to download document");
  }
});

router.get("/api/vendor/document-types", async (_req, res) => {
  try {
    const result = service.getDocumentTypes();
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch document types");
  }
});

router.get("/api/vendor/references", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.getReferences(sessionUser);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch references");
  }
});

router.post("/api/vendor/references", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.createReference(sessionUser, req.body);
    res.json(result);
    audit(req, String(result.id || "ref"), "CREATE", "Supplier reference created", "VENDOR_REGISTRATION");
  } catch (error: any) {
    handleError(res, error, "Failed to create reference");
  }
});

router.patch("/api/vendor/references/:id", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.updateReference(sessionUser, req.params.id, req.body);
    res.json(result);
    audit(req, req.params.id, "UPDATE", "Supplier reference updated", "VENDOR_REGISTRATION");
  } catch (error: any) {
    handleError(res, error, "Failed to update reference");
  }
});

router.delete("/api/vendor/references/:id", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.deleteReference(sessionUser, req.params.id);
    res.json(result);
    audit(req, req.params.id, "DELETE", "Supplier reference deleted", "VENDOR_REGISTRATION");
  } catch (error: any) {
    handleError(res, error, "Failed to delete reference");
  }
});

router.get("/api/vendor/registration-summary", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.getRegistrationSummary(sessionUser);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch registration summary");
  }
});

router.get("/api/vendor/workflow-approval-history", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.getWorkflowApprovalHistory(sessionUser);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch workflow approval history");
  }
});


router.post("/api/vendor/submit-registration", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.submitRegistration(sessionUser);
    res.json(result);
    audit(req, String(sessionUser.supplierId), "APPROVAL", "New Supplier registration submitted for approval", "VENDOR");
  } catch (error: any) {
    handleError(res, error, "Failed to submit registration");
  }
});

router.post("/api/vendor/submit-changes", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const result = await service.submitChangesForApproval(sessionUser);
    res.json(result);
    audit(req, String(sessionUser.supplierId), "UPDATE", "Supplier profile changes submitted for approval", "VENDOR");
  } catch (error: any) {
    handleError(res, error, "Failed to submit changes for approval");
  }
});

async function loadRegistrationLookupBundle(): Promise<LookupBundle> {
  const [countries, legalEntities, currencies, paymentTerms] = await Promise.all([
    service.getLookup("countries"),
    service.getLookup("legal-entities"),
    service.getLookup("currencies"),
    service.getLookup("payment-terms"),
  ]);
  const mapRows = (rows: any[]) =>
    (rows || [])
      .map((r: any) => ({
        value: String(r.value ?? r.key_2 ?? ""),
        label: String(r.label ?? r.description ?? r.value ?? ""),
      }))
      .filter((x) => x.value && x.label);
  return {
    countries: mapRows(countries as any[]),
    legalEntities: mapRows(legalEntities as any[]),
    currencies: mapRows(currencies as any[]),
    paymentTerms: mapRows(paymentTerms as any[]),
  };
}

function pruneFieldConfidences(
  fc: Record<string, number>,
  resolved: { company: Record<string, string>; banking: Record<string, string> }
): Record<string, number> {
  const next = { ...fc };
  for (const k of Object.keys(next)) {
    const [sec, key] = k.split(".");
    if (sec === "company" && !(key in resolved.company)) delete next[k];
    if (sec === "banking" && !(key in resolved.banking)) delete next[k];
  }
  return next;
}

router.post("/api/vendor/registration/extract-document", rewrapTenantContext, upload.single("file"), async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    if (!sessionUser) return res.status(401).json({ error: "Not authenticated" });
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const validation = validateUploadedFile(file);
    if (!validation.valid) return res.status(400).json({ error: validation.error });

    const structured = await extractStructuredDocument(file.buffer, file.mimetype, file.originalname);
    const lookups = await loadRegistrationLookupBundle();
    const resolved = applyLookupResolutionsToExtracted(structured.company, structured.banking, lookups);
    const fc = pruneFieldConfidences(structured.fieldConfidences, resolved);

    let draft: VendorRegistrationDraftSession =
      (req as any).session.vendorRegistrationDraft || emptyDraftSession();
    if (!draft.phase) draft.phase = "document_gathering";

    const certDocType = DOC_TYPE_MAP[structured.documentType] || "other";
    if (certDocType !== "other") {
      await deDuplicateCertificate(sessionUser, req, certDocType);
      draft = clearDraftFieldsForDocType(draft, structured.documentType);
    }

    draft = mergeExtractionIntoDraft(draft, {
      documentType: structured.documentType,
      company: resolved.company,
      banking: resolved.banking,
      fieldConfidences: fc,
    });

    (req as any).session.vendorRegistrationDraft = draft;
    const pendingDocs: any[] = (req as any).session.pendingAiDocuments || [];
    pendingDocs.push({
      tempPath: saveTempFile(file),
      originalname: file.originalname,
      mimetype: file.mimetype,
      docType: certDocType,
      docName: file.originalname.replace(/\.[^/.]+$/, ""),
      sourceStructuredType: structured.documentType,
    });
    (req as any).session.pendingAiDocuments = pendingDocs;
    await new Promise<void>((resolve, reject) => {
      (req as any).session.save((err: any) => (err ? reject(err) : resolve()));
    });

    if (sessionUser.supplierId) {
      await savePendingDocuments(sessionUser, req);
    }

    const missing = computeMissingMandatory(draft);
    const droppedNotes = resolved.droppedKeys.map((d) => `No exact list match for ${d} — please select manually.`);

    const lastUploadExtraction = { company: {} as Record<string, string>, banking: {} as Record<string, string> };
    for (const [k, v] of Object.entries(resolved.company)) {
      if (v != null && String(v).trim() !== "") lastUploadExtraction.company[k] = v;
    }
    for (const [k, v] of Object.entries(resolved.banking)) {
      if (v != null && String(v).trim() !== "") lastUploadExtraction.banking[k] = v;
    }

    res.json({
      documentType: structured.documentType,
      fieldsApplied: structured.fields,
      draft,
      lastUploadExtraction,
      missingMandatory: {
        company: missing.company,
        banking: missing.banking,
        companyLabels: missing.companyLabels,
        bankingLabels: missing.bankingLabels,
      },
      validationWarnings: [...structured.validationWarnings, ...droppedNotes],
      assistantSummary: buildAssistantSummary(
        draft,
        [file.originalname],
        structured.documentType,
        lastUploadExtraction,
        [structured.documentType],
      ),
    });
  } catch (error: any) {
    handleError(res, error, "Failed to extract document");
  }
});

router.post("/api/vendor/registration/confirm-draft", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    if (!sessionUser) return res.status(401).json({ error: "Not authenticated" });
    const draft: VendorRegistrationDraftSession =
      (req as any).session.vendorRegistrationDraft || emptyDraftSession();
    draft.phase = "form_review";
    (req as any).session.vendorRegistrationDraft = draft;
    await new Promise<void>((resolve, reject) => {
      (req as any).session.save((err: any) => (err ? reject(err) : resolve()));
    });
    const user = (req as any).session?.user;
    if (user?.supplierId && (req as any).session.pendingAiDocuments?.length > 0) {
      await savePendingDocuments(user, req);
    }
    res.json({ success: true, draft: (req as any).session.vendorRegistrationDraft || draft });
  } catch (error: any) {
    handleError(res, error, "Failed to confirm draft");
  }
});

router.post("/api/vendor/registration/clear-draft", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    if (!sessionUser) return res.status(401).json({ error: "Not authenticated" });
    const pending = (req as any).session.pendingAiDocuments;
    if (Array.isArray(pending)) {
      for (const doc of pending) {
        try {
          if (doc?.tempPath && fs.existsSync(doc.tempPath)) fs.unlinkSync(doc.tempPath);
        } catch {
          /* ignore */
        }
      }
    }

    let profileReset = false;
    try {
      const r = await service.resetDraftSupplierRegistration(sessionUser);
      profileReset = !!r.profileReset;
      if (profileReset) {
        audit(req, String(sessionUser.supplierId || "vendor"), "UPDATE", "Draft registration reset (AI Start over)", "VENDOR_REGISTRATION");
      }
    } catch (resetErr: any) {
      console.error("[clear-draft] reset draft supplier failed:", resetErr?.message || resetErr);
    }

    (req as any).session.pendingAiDocuments = [];
    delete (req as any).session.vendorRegistrationDraft;
    await new Promise<void>((resolve, reject) => {
      (req as any).session.save((err: any) => (err ? reject(err) : resolve()));
    });
    if (sessionUser.userName && sessionUser.orgId) {
      try { await deleteDraftBackup(sessionUser.userName, Number(sessionUser.orgId)); } catch { }
    }
    res.json({ success: true, profileReset });
  } catch (error: any) {
    handleError(res, error, "Failed to clear draft");
  }
});

router.post("/api/vendor/registration/clear-company-draft", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    if (!sessionUser) return res.status(401).json({ error: "Not authenticated" });
    const existing = (req as any).session.vendorRegistrationDraft;
    if (existing) {
      const fieldMeta = { ...(existing.fieldMeta || {}) };
      for (const k of Object.keys(fieldMeta)) {
        if (k.startsWith("company.")) delete fieldMeta[k];
      }
      (req as any).session.vendorRegistrationDraft = {
        ...existing,
        company: {},
        fieldMeta,
      };
      await new Promise<void>((resolve, reject) => {
        (req as any).session.save((err: any) => (err ? reject(err) : resolve()));
      });
    }
    res.json({ success: true });
  } catch (error: any) {
    handleError(res, error, "Failed to clear company draft");
  }
});

router.get("/api/vendor/registration/draft", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    if (!sessionUser) return res.status(401).json({ error: "Not authenticated" });
    const draft = (req as any).session.vendorRegistrationDraft || null;
    const missing = draft ? computeMissingMandatory(draft) : null;
    res.json({ draft, missingMandatory: missing });
  } catch (error: any) {
    handleError(res, error, "Failed to read draft");
  }
});

const MAX_DRAFT_STRING_LEN = 2000;
const MAX_DRAFT_KEYS_PER_SECTION = 120;

function sanitizeStringMap(
  input: unknown,
  maxKeys: number,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (n >= maxKeys) break;
    if (typeof k !== "string" || k.length > 80) continue;
    const s = v == null ? "" : String(v);
    out[k] = s.length > MAX_DRAFT_STRING_LEN ? s.slice(0, MAX_DRAFT_STRING_LEN) : s;
    n++;
  }
  return out;
}

function sanitizeFieldMeta(input: unknown): VendorRegistrationDraftSession["fieldMeta"] {
  const out: VendorRegistrationDraftSession["fieldMeta"] = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (n >= 300) break;
    if (typeof k !== "string" || !/^(company|banking)\./.test(k)) continue;
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const o = v as Record<string, unknown>;
    const confidence = Math.max(
      0,
      Math.min(100, Number(o.confidence) || 0),
    );
    const source = o.source === "user" ? "user" : "ai";
    const needsReview = !!o.needsReview;
    const userLocked = !!o.userLocked;
    const lastDocumentType =
      typeof o.lastDocumentType === "string" ? o.lastDocumentType.slice(0, 64) : undefined;
    out[k] = {
      confidence,
      source,
      needsReview,
      userLocked,
      lastDocumentType,
    };
    n++;
  }
  return out;
}

function sanitizeClientDraftBody(body: unknown): VendorRegistrationDraftSession | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const d = body as Record<string, unknown>;
  const phase =
    d.phase === "form_review" ? "form_review" : "document_gathering";
  const company = sanitizeStringMap(d.company, MAX_DRAFT_KEYS_PER_SECTION);
  const banking = sanitizeStringMap(d.banking, MAX_DRAFT_KEYS_PER_SECTION);
  const fieldMeta = sanitizeFieldMeta(d.fieldMeta);
  const uploadedDocumentTypes = Array.isArray(d.uploadedDocumentTypes)
    ? (d.uploadedDocumentTypes as unknown[])
      .filter((x) => typeof x === "string")
      .map((x) => (x as string).slice(0, 64))
      .slice(0, 32)
    : [];
  return {
    phase,
    company,
    banking,
    fieldMeta,
    uploadedDocumentTypes,
  };
}

/**
 * Parse the client-supplied accumulated draft (multipart field on /ai-chat). The AI chat
 * keeps field data local until Confirm & Continue, so it sends its working draft with each
 * request to serve as the merge base instead of the server session.
 */
function parseClientCurrentDraft(req: any): VendorRegistrationDraftSession | null {
  const raw = req?.body?.currentDraft;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    return sanitizeClientDraftBody(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Persist full registration draft to session (keeps AI Apply / manual edits in sync with GET /draft). */
router.post("/api/vendor/registration/draft", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    if (!sessionUser) return res.status(401).json({ error: "Not authenticated" });
    const raw = (req.body as any)?.draft;
    const sanitized = sanitizeClientDraftBody(raw);
    if (!sanitized) {
      return res.status(400).json({ error: "Invalid draft payload" });
    }
    (req as any).session.vendorRegistrationDraft = sanitized;
    await new Promise<void>((resolve, reject) => {
      (req as any).session.save((err: any) => (err ? reject(err) : resolve()));
    });
    const missing = computeMissingMandatory(sanitized);
    res.json({ success: true, draft: sanitized, missingMandatory: missing });
  } catch (error: any) {
    handleError(res, error, "Failed to save draft");
  }
});

const DOC_TYPE_MAP: Record<string, string> = {
  incorporation_certificate: "tradelicense",
  tax_certificate: "vatcertificate",
  gst_certificate: "vatcertificate",
  pan_card: "other",
  bank_letter: "BANK_DOCUMENT",
  cancelled_cheque: "BANK_DOCUMENT",
  trade_license: "tradelicense",
  other: "other",
};

const TEMP_UPLOAD_DIR = path.join(process.cwd(), 'uploads', '_temp_ai_chat');

function saveTempFile(file: Express.Multer.File): string {
  fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
  const tempName = `${Date.now()}_${Math.random().toString(36).slice(2)}_${file.originalname}`;
  const tempPath = path.join(TEMP_UPLOAD_DIR, tempName);
  fs.writeFileSync(tempPath, file.buffer);
  return tempPath;
}

/** One banking file per save: prefer bank letter, else cancelled cheque; drop others and delete their temp files. */
function dedupeBankingPendingAiDocuments(
  pending: Array<{ tempPath: string; sourceStructuredType?: string }>,
): typeof pending {
  const bankingIdx: number[] = [];
  for (let i = 0; i < pending.length; i++) {
    const t = pending[i].sourceStructuredType;
    if (t === "bank_letter" || t === "cancelled_cheque") bankingIdx.push(i);
  }
  if (bankingIdx.length <= 1) return pending;
  const keepIndex =
    bankingIdx.find((i) => pending[i].sourceStructuredType === "bank_letter") ?? bankingIdx[0];
  for (const i of bankingIdx) {
    if (i !== keepIndex && pending[i].tempPath) {
      try {
        if (fs.existsSync(pending[i].tempPath)) fs.unlinkSync(pending[i].tempPath);
      } catch {
        /* ignore */
      }
    }
  }
  return pending.filter((_, i) => !bankingIdx.includes(i) || i === keepIndex);
}

async function savePendingDocuments(sessionUser: any, req: any) {
  const session = (req as any).session;
  let pendingDocs = session?.pendingAiDocuments;
  if (!pendingDocs || pendingDocs.length === 0 || !sessionUser.supplierId) return;

  pendingDocs = dedupeBankingPendingAiDocuments([...pendingDocs]);
  session.pendingAiDocuments = pendingDocs;

  console.log(`[AI-Chat] Saving ${pendingDocs.length} pending document(s) to certificates for supplier ${sessionUser.supplierId}`);

  for (const doc of pendingDocs) {
    try {
      if (!fs.existsSync(doc.tempPath)) {
        console.error(`[AI-Chat] Temp file not found: ${doc.tempPath}`);
        continue;
      }
      const fileBuffer = fs.readFileSync(doc.tempPath);
      const fakeFile: Express.Multer.File = {
        buffer: fileBuffer,
        originalname: doc.originalname,
        mimetype: doc.mimetype,
        size: fileBuffer.length,
        fieldname: 'file',
        encoding: '7bit',
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      await service.uploadDocument(sessionUser, {
        doc_type: doc.docType,
        doc_name: doc.docName,
        doc_desc: `Auto-uploaded via AI Registration Assistant`,
      }, fakeFile, getTenantDomain(req) ?? undefined);

      console.log(`[AI-Chat] Saved document: ${doc.originalname} as ${doc.docType}`);
      try { fs.unlinkSync(doc.tempPath); } catch { }
    } catch (err: any) {
      console.error(`[AI-Chat] Failed to save document ${doc.originalname}:`, err?.message);
    }
  }

  session.pendingAiDocuments = [];
  await new Promise<void>((resolve, reject) => {
    session.save((err: any) => { if (err) reject(err); else resolve(); });
  });
}

router.get("/api/vendor/ai-chat/pending-documents/:name", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    if (!sessionUser) return res.status(401).json({ error: "Not authenticated" });

    const rawName = decodeURIComponent(String(req.params.name || "")).trim();
    if (!rawName) return res.status(400).json({ error: "Invalid document name" });

    const pendingDocs = (req as any).session?.pendingAiDocuments || [];
    const target = rawName.toLowerCase();
    const match = [...pendingDocs]
      .reverse()
      .find((doc: any) => String(doc?.originalname || "").toLowerCase() === target);

    if (!match) return res.status(404).json({ error: "Pending document not found" });

    const tempPath = String(match.tempPath || "");
    if (!tempPath) return res.status(404).json({ error: "Pending document not found" });

    const resolvedPath = path.resolve(tempPath);
    const tempRoot = path.resolve(TEMP_UPLOAD_DIR);
    if (!resolvedPath.startsWith(tempRoot)) {
      return res.status(400).json({ error: "Invalid document path" });
    }
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: "File not found" });
    }

    const mimeType = match.mimetype || "application/octet-stream";
    const safeFilename = sanitizeFilename(match.originalname || "document");
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename=\"${safeFilename}\"`);
    res.setHeader("X-Content-Type-Options", "nosniff");

    fs.createReadStream(resolvedPath).pipe(res);
  } catch (error: any) {
    handleError(res, error, "Failed to load pending document");
  }
});

router.delete("/api/vendor/ai-chat/pending-documents/:name", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    if (!sessionUser) return res.status(401).json({ error: "Not authenticated" });

    const rawName = decodeURIComponent(String(req.params.name || "")).trim();
    if (!rawName) return res.status(400).json({ error: "Invalid document name" });

    const pendingDocs = (req as any).session?.pendingAiDocuments || [];
    const target = rawName.toLowerCase();
    const matchIndex = [...pendingDocs]
      .reverse()
      .findIndex((doc: any) => String(doc?.originalname || "").toLowerCase() === target);

    if (matchIndex === -1) {
      return res.status(404).json({ error: "Pending document not found" });
    }

    const actualIndex = pendingDocs.length - 1 - matchIndex;
    const match = pendingDocs[actualIndex];

    const tempPath = String(match.tempPath || "");
    if (tempPath) {
      const resolvedPath = path.resolve(tempPath);
      const tempRoot = path.resolve(TEMP_UPLOAD_DIR);
      if (resolvedPath.startsWith(tempRoot) && fs.existsSync(resolvedPath)) {
        try {
          await fs.promises.unlink(resolvedPath);
        } catch (err: any) {
          console.error("[DELETE Pending Document] Failed to unlink file:", err?.message);
        }
      }
    }

    pendingDocs.splice(actualIndex, 1);
    (req as any).session.pendingAiDocuments = pendingDocs;
    await new Promise<void>((resolve, reject) => {
      (req as any).session.save((err: any) => (err ? reject(err) : resolve()));
    });

    res.json({
      success: true,
      docType: match.sourceStructuredType || match.docType,
    });
  } catch (error: any) {
    handleError(res, error, "Failed to delete pending document");
  }
});


router.post("/api/vendor/ai-chat", rewrapTenantContext, upload.array("files", 5), async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    if (!sessionUser) return res.status(401).json({ error: "Not authenticated" });

    const { prompt, conversationHistory } = req.body;
    const parsedHistory = typeof conversationHistory === "string"
      ? JSON.parse(conversationHistory)
      : conversationHistory || [];

    const uploadedFiles = (req as any).files as Express.Multer.File[] | undefined;

    console.log(`[AI-Chat] Received prompt="${(prompt || "").substring(0, 50)}", files=${uploadedFiles?.length || 0}`);

    if (uploadedFiles && uploadedFiles.length > 0) {
      uploadedFiles.forEach((f, i) =>
        console.log(`[AI-Chat] File[${i}]: ${f.originalname}, type=${f.mimetype}, size=${f.size}`)
      );

      const lookups = await loadRegistrationLookupBundle();
      // Merge onto the client's locally-accumulated draft when provided (AI chat keeps field
      // data local until Confirm & Continue); fall back to session for older clients.
      let draft: VendorRegistrationDraftSession =
        parseClientCurrentDraft(req) ||
        (req as any).session.vendorRegistrationDraft ||
        emptyDraftSession();
      draft.phase = draft.phase || "document_gathering";

      let pendingDocs: any[] = (req as any).session.pendingAiDocuments || [];
      const allWarnings: string[] = [];
      const processedNames: string[] = [];
      const batchDocumentTypes: string[] = [];
      const extractionsPerFile: Array<{ company: Record<string, string>; banking: Record<string, string> }> = [];
      let lastStructuredDocType: string | undefined;
      const lastUploadExtraction: { company: Record<string, string>; banking: Record<string, string> } = {
        company: {},
        banking: {},
      };

      for (const file of uploadedFiles) {
        processedNames.push(file.originalname);

        const validation = validateUploadedFile(file);
        if (!validation.valid) {
          allWarnings.push(`File "${file.originalname}": ${validation.error}`);
          batchDocumentTypes.push("other");
          extractionsPerFile.push({ company: {}, banking: {} });
          continue;
        }

        let structured;
        try {
          structured = await extractStructuredDocument(file.buffer, file.mimetype, file.originalname);
        } catch (err: any) {
          console.error(`[AI-Chat] Extraction failed for file "${file.originalname}":`, err?.message);
          allWarnings.push(`File "${file.originalname}": Extraction failed`);
          batchDocumentTypes.push("other");
          extractionsPerFile.push({ company: {}, banking: {} });
          continue;
        }

        lastStructuredDocType = structured.documentType;
        batchDocumentTypes.push(structured.documentType);
        const resolved = applyLookupResolutionsToExtracted(structured.company, structured.banking, lookups);

        const fileExtraction = {
          company: {} as Record<string, string>,
          banking: {} as Record<string, string>,
        };
        for (const [k, v] of Object.entries(resolved.company)) {
          if (v != null && String(v).trim() !== "") {
            lastUploadExtraction.company[k] = v;
            fileExtraction.company[k] = v;
          }
        }
        for (const [k, v] of Object.entries(resolved.banking)) {
          if (v != null && String(v).trim() !== "") {
            lastUploadExtraction.banking[k] = v;
            fileExtraction.banking[k] = v;
          }
        }
        extractionsPerFile.push(fileExtraction);

        const fc = pruneFieldConfidences(structured.fieldConfidences, resolved);

        const certDocType = DOC_TYPE_MAP[structured.documentType] || "other";
        if (certDocType !== "other") {
          await deDuplicateCertificate(sessionUser, req, certDocType);
          draft = clearDraftFieldsForDocType(draft, structured.documentType);
        }

        draft = mergeExtractionIntoDraft(draft, {
          documentType: structured.documentType,
          company: resolved.company,
          banking: resolved.banking,
          fieldConfidences: fc,
        });
        allWarnings.push(...structured.validationWarnings);
        allWarnings.push(
          ...resolved.droppedKeys.map(
            (d) => `No exact list match for ${d} — please select manually.`
          )
        );

        pendingDocs = (req as any).session.pendingAiDocuments || [];
        pendingDocs.push({
          tempPath: saveTempFile(file),
          originalname: file.originalname,
          mimetype: file.mimetype,
          docType: certDocType,
          docName: file.originalname.replace(/\.[^/.]+$/, ""),
          sourceStructuredType: structured.documentType,
        });
        (req as any).session.pendingAiDocuments = pendingDocs;
      }

      // Do NOT persist the field draft to the session here — the AI chat keeps field data
      // local and only persists it on Confirm & Continue. Pending document temp files still
      // need to survive in the session so they can be saved on confirm.
      (req as any).session.pendingAiDocuments = pendingDocs;
      await new Promise<void>((resolve, reject) => {
        (req as any).session.save((err: any) => (err ? reject(err) : resolve()));
      });

      if (sessionUser.supplierId) {
        await savePendingDocuments(sessionUser, req);
      }

      const missing = computeMissingMandatory(draft);
      const responseText = buildAssistantSummary(
        draft,
        processedNames,
        lastStructuredDocType,
        lastUploadExtraction,
        batchDocumentTypes,
      );

      return res.json({
        response: responseText,
        draft,
        lastDocumentType: lastStructuredDocType,
        lastUploadExtraction,
        extractionsPerFile,
        documentTypesProcessedInBatch: batchDocumentTypes,
        missingMandatory: {
          company: missing.company,
          banking: missing.banking,
          companyLabels: missing.companyLabels,
          bankingLabels: missing.bankingLabels,
        },
        validationWarnings: allWarnings,
      });
    }

    const draftPhase = (req as any).session?.vendorRegistrationDraft?.phase;
    const allowPersistTools = draftPhase === "form_review";

    const result = await processVendorRegistrationChat(
      prompt || "",
      parsedHistory,
      sessionUser,
      req,
      undefined,
      { allowPersistTools }
    );

    if (sessionUser.supplierId && (req as any).session.pendingAiDocuments?.length > 0) {
      await savePendingDocuments(sessionUser, req);
    }

    // Prefer the session draft (present after confirm); before confirm the chat keeps its
    // draft locally, so echo back what the client sent rather than wiping its view.
    result.draft = (req as any).session.vendorRegistrationDraft || parseClientCurrentDraft(req) || undefined;
    if (result.draft) {
      const m = computeMissingMandatory(result.draft);
      result.missingMandatory = {
        company: m.company,
        banking: m.banking,
        companyLabels: m.companyLabels,
        bankingLabels: m.bankingLabels,
      };
    }
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to process AI chat");
  }
});

router.get("/api/vendor/reviewpdf/:suppId", async (req, res) => {

    try 
    {
      const sessionUser = (req as any).session?.user;    
        const pdf = await service.generatepdfReview(req.params.suppId,sessionUser.name);

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `inline; filename=Supplier_${req.params.suppId}.pdf`
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

export { router as vendorRegistrationController };
