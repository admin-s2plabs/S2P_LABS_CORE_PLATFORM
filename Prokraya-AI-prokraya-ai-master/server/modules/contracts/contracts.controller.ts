import puppeteer from "puppeteer";
import { Router } from "express";
import fs from "fs";
import path from "path";
import { AINotConfiguredError } from "../../services/ai-client";
import { EventTypes } from "../../services/eventBus/events";
import { eventBus } from "../../services/eventBus/index";
import { getContextPool, rewrapTenantContext } from "../../tenant-context";
import { pool } from "../_shared";
import { sanitizeFilename, upload, validateUploadedFile } from "../_shared/file-upload";
import { logAudit, normalizeAuditVendorTerminology } from "../administration/administration.service";
import * as aiService from "./contracts-ai.service";
import * as service from "./contracts.service";
import * as adminRepo from "../administration/administration.repository.ts";
const getPool = () => getContextPool() ?? pool;

// ── Fuzzy title similarity (word-overlap Jaccard) ─────────────────────────────
const STOP_WORDS = new Set(["of", "the", "and", "for", "in", "on", "to", "a", "an", "with", "by", "at", "from"]);
function titleWords(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 1 && !STOP_WORDS.has(w))
  );
}
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = Array.from(a).filter(w => b.has(w)).length;
  const union = new Set([...Array.from(a), ...Array.from(b)]).size;
  return union === 0 ? 0 : intersection / union;
}
async function markExistingClauses(clauses: any[], tenantPool?: any): Promise<any[]> {
  const dbPool = getPool();
  const { rows } = await dbPool.query(`SELECT section_name FROM dbo.cm_sections WHERE template_id = 0`);
  const existingNames: string[] = rows.map((r: any) => r.section_name);
  return clauses.map((clause) => {
    const genWords = titleWords(clause.section_name || "");
    const match = existingNames.find((name) => jaccardSimilarity(genWords, titleWords(name)) >= 0.5);
    return match ? { ...clause, _already_exists: true, _match_name: match } : clause;
  });
}

const router = Router();

function handleError(res: any, error: any, fallbackMessage: string) {
  if (error?.status) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(fallbackMessage + ":", error);
  res.status(500).json({ error: error?.message || fallbackMessage });
}

function audit(req: any, auditKey: string, auditAction: string, auditMessage: string) {
  const user = (req as any).user;
  logAudit({
    auditKey,
    auditAction,
    auditMessage,
    fullName: user?.name || "System",
    userId: user?.id || "system",
    module: "CONTRACTS",
  }).catch((err: any) => console.error("[Audit] Failed to log:", err?.message));
}

router.get("/api/contracts/sections/types", async (req, res) => {
  try {
    const types = await service.getDistinctSectionTypes();
    res.json(types);
  } catch (error) {
    handleError(res, error, "Failed to fetch section types");
  }
});

router.get("/api/contracts/sections/stats", async (req, res) => {
  try {
    const stats = await service.getSectionStats();
    res.json(stats);
  } catch (error) {
    handleError(res, error, "Failed to fetch section stats");
  }
});

router.get("/api/contracts/sections", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const type = (req.query.type as string) || "";
    const result = await service.getSections({ page, limit, search, type: type || undefined });
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch sections");
  }
});

router.get("/api/contracts/sections/:id", async (req, res) => {
  try {
    const section = await service.getSectionById(parseInt(req.params.id));
    if (!section) return res.status(404).json({ error: "Section not found" });
    res.json(section);
  } catch (error) {
    handleError(res, error, "Failed to fetch section");
  }
});

router.post("/api/contracts/sections", async (req, res) => {
  try {
    const user = (req as any).user;
    const section = await service.createSection({
      ...req.body,
      created_by: user?.email || user?.name || "system",
    });
    res.status(201).json(section);
    audit(req, String(section.section_id), "CREATE", `Section created: ${section.section_name}`);
  } catch (error) {
    handleError(res, error, "Failed to create section");
  }
});

router.put("/api/contracts/sections/:id", async (req, res) => {
  try {
    const user = (req as any).user;
    const section = await service.updateSection(parseInt(req.params.id), {
      ...req.body,
      last_modified_by: user?.email || user?.name || "system",
    });
    if (!section) return res.status(404).json({ error: "Section not found" });
    res.json(section);
    audit(req, req.params.id, "UPDATE", `Section updated: ${section.section_name}`);
  } catch (error) {
    handleError(res, error, "Failed to update section");
  }
});

router.delete("/api/contracts/sections/:id", async (req, res) => {
  try {
    const deleted = await service.deleteSection(parseInt(req.params.id));
    if (!deleted) return res.status(404).json({ error: "Section not found" });
    res.json({ success: true });
    audit(req, req.params.id, "DELETE", `Section deleted: ${req.params.id}`);
  } catch (error) {
    handleError(res, error, "Failed to delete section");
  }
});

// ─── AI FEATURES ─────────────────────────────────────────────────────────────

function handleAIError(res: any, error: any) {
  if (error instanceof AINotConfiguredError) {
    return res.status(503).json({ error: error.message, code: "AI_NOT_CONFIGURED" });
  }
  console.error("[Contracts AI]", error);
  res.status(500).json({ error: error?.message || "AI request failed" });
}

router.post("/api/contracts/ai/generate", async (req, res) => {
  try {
    const result = await aiService.generateClauseFromDescription(req.body);
    res.json(result);
  } catch (error) { handleAIError(res, error); }
});

router.post("/api/contracts/ai/extract", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { documentText, contractId } = req.body;
    const result = await aiService.extractClausesFromDocument(documentText || "");
    const raw: any[] = Array.isArray(result) ? result : (result as any).clauses || [];

    let clauses: any[];
    if (contractId) {
      // Contract-scoped import: match against clauses already in THIS contract
      const { rows } = await tenantPool.query(
        `SELECT terms_name FROM dbo.cm_contracts_terms WHERE contractrefno = $1`,
        [contractId]
      );
      const existingNames: string[] = rows.map((r: any) => r.terms_name);
      clauses = raw.map((clause) => {
        const genWords = titleWords(clause.section_name || "");
        const match = existingNames.find((name) => jaccardSimilarity(genWords, titleWords(name)) >= 0.5);
        return match ? { ...clause, _already_exists: true, _match_name: match } : clause;
      });
    } else {
      // Standalone extract page: match against global clause library (template_id = 0)
      clauses = await markExistingClauses(raw, tenantPool);
    }

    res.json({ clauses });
  } catch (error) { handleAIError(res, error); }
});

router.post("/api/contracts/ai/improve", async (req, res) => {
  try {
    const result = await aiService.improveClause(req.body);
    res.json(result);
  } catch (error) { handleAIError(res, error); }
});

router.post("/api/contracts/ai/analyze-risk", async (req, res) => {
  try {
    const result = await aiService.analyzeClauseRisk(req.body);
    res.json(result);
  } catch (error) { handleAIError(res, error); }
});

router.post("/api/contracts/ai/suggest-variables", async (req, res) => {
  try {
    const { htmlContent } = req.body;
    const result = await aiService.suggestVariablesInClause(htmlContent || "");
    res.json(result);
  } catch (error) { handleAIError(res, error); }
});

router.post("/api/contracts/ai/find-duplicates", async (req, res) => {
  try {
    const result = await aiService.findSimilarClauses(req.body);
    res.json(result);
  } catch (error) { handleAIError(res, error); }
});

router.post("/api/contracts/ai/chat", async (req, res) => {
  try {
    const result = await aiService.clauseChat(req.body);
    res.json(result);
  } catch (error) { handleAIError(res, error); }
});

router.post("/api/contracts/ai/initialize-library", async (req, res) => {
  try {
    const tenantPool = (req as any).tenantPool;
    const { contractTypes, organizationContext, preview } = req.body;
    const clauses = await aiService.initializeClauseLibrary({ contractTypes, organizationContext });

    // preview=true → return generated clauses with duplicate flags, don't save
    if (preview) {
      const tenantPool = (req as any).tenantPool;
      const markedClauses = await markExistingClauses(clauses, tenantPool);
      return res.json({ clauses: markedClauses });
    }

    // Default: bulk insert selected clauses
    const user = (req as any).user;
    const createdBy = user?.email || user?.name || "system";
    const created = await Promise.all(
      clauses.map(async (clause: any) => {
        const { _contract_type, ...data } = clause;
        return service.createSection({ ...data, created_by: createdBy });
      })
    );
    res.json({ count: created.length, sections: created });
    logAudit({
      auditKey: "AI_INIT_LIBRARY",
      auditAction: "CREATE",
      auditMessage: `AI initialized clause library with ${created.length} clauses for: ${contractTypes.join(", ")}`,
      fullName: createdBy,
      userId: user?.id || "system",
      module: "CONTRACTS",
    }).catch(() => {});
  } catch (error) { handleAIError(res, error); }
});

// Save selected AI-previewed clauses to library
router.post("/api/contracts/ai/save-library-clauses", async (req, res) => {
  try {
    const { clauses } = req.body;
    const user = (req as any).user;
    const createdBy = user?.email || user?.name || "system";
    const created = await Promise.all(
      (clauses || []).map(async (clause: any) => {
        const { _contract_type, ...data } = clause;
        return service.createSection({ ...data, created_by: createdBy });
      })
    );
    res.json({ count: created.length });
    logAudit({
      auditKey: "AI_SAVE_LIBRARY",
      auditAction: "CREATE",
      auditMessage: `User added ${created.length} AI-suggested clauses to the library`,
      fullName: createdBy,
      userId: user?.id || "system",
      module: "CONTRACTS",
    }).catch(() => {});
  } catch (error) { handleAIError(res, error); }
});

// Save selected clauses as template (global + template copies, dedup both)
router.post("/api/contracts/ai/save-as-template", async (req, res) => {
  try {
    const tenantPool = getPool();
    const user = (req as any).user;
    const createdBy = user?.email || user?.name || "system";
    const { clauses, templateId, templateName } = req.body;

    if (!clauses?.length) return res.status(400).json({ error: "No clauses provided" });

    // 1. Resolve template — create new if name given but no id
    let resolvedTemplateId = templateId;
    let resolvedTemplateName = templateName;
    if (!resolvedTemplateId && templateName?.trim()) {
      const { rows } = await tenantPool.query(
        `INSERT INTO dbo.cm_template (template_name, template_description) VALUES ($1, NULL) RETURNING id, template_name`,
        [templateName.trim()]
      );
      resolvedTemplateId = rows[0].id;
      resolvedTemplateName = rows[0].template_name;
    }
    if (!resolvedTemplateId) return res.status(400).json({ error: "Template ID or name is required" });

    // 2. Load existing global clause names (template_id=0) for dedup
    const { rows: globalRows } = await tenantPool.query(
      `SELECT section_name FROM dbo.cm_sections WHERE template_id = 0`
    );
    const globalNames: string[] = globalRows.map((r: any) => r.section_name);

    // 3. Load existing template clause names for dedup
    const { rows: templateRows } = await tenantPool.query(
      `SELECT section_name FROM dbo.cm_sections WHERE template_id = $1`,
      [resolvedTemplateId]
    );
    const templateNames: string[] = templateRows.map((r: any) => r.section_name);

    let globalAdded = 0;
    let templateAdded = 0;

    for (const clause of clauses) {
      const { _contract_type, _already_exists, _match_name, ...data } = clause;
      const genWords = titleWords(data.section_name || "");

      // Global insert — skip if duplicate
      const globalMatch = globalNames.find((n) => jaccardSimilarity(genWords, titleWords(n)) >= 0.5);
      if (!globalMatch) {
        await service.createSection({ ...data, created_by: createdBy });
        globalNames.push(data.section_name);
        globalAdded++;
      }

      // Template insert — skip if duplicate in this template
      const templateMatch = templateNames.find((n) => jaccardSimilarity(genWords, titleWords(n)) >= 0.5);
      if (!templateMatch) {
        const idResult = await tenantPool.query(
          `SELECT COALESCE(MAX(section_id), 380000000) + 1 AS next_id FROM dbo.cm_sections`
        );
        const newId = idResult.rows[0].next_id;
        await tenantPool.query(
          `INSERT INTO dbo.cm_sections
             (section_id, section_name, section_type, description, html_content,
              clause_ammendable, clause_negotiable, clause_mandatory, orderby,
              template_id, created_by, creation_date, last_modified_by, last_modified_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$11,NOW())`,
          [
            newId, data.section_name, data.section_type || "Custom",
            data.description || null, data.html_content || null,
            data.clause_ammendable || "No", data.clause_negotiable || "No",
            data.clause_mandatory || "No", data.orderby || null,
            resolvedTemplateId, createdBy,
          ]
        );
        templateNames.push(data.section_name);
        templateAdded++;
      }
    }

    res.json({ globalAdded, templateAdded, templateId: resolvedTemplateId, templateName: resolvedTemplateName });
    logAudit({
      auditKey: "AI_SAVE_TEMPLATE",
      auditAction: "CREATE",
      auditMessage: `Save as Template: ${globalAdded} global + ${templateAdded} template clauses saved to "${resolvedTemplateName}"`,
      fullName: createdBy,
      userId: user?.id || "system",
      module: "CONTRACTS",
    }).catch(() => {});
  } catch (error) { handleAIError(res, error); }
});

// ─── TERMS ───────────────────────────────────────────────────────────────────

router.get("/api/contracts/terms/types", async (req, res) => {
  try {
    const types = await service.getDistinctTermTypes();
    res.json(types);
  } catch (error) {
    handleError(res, error, "Failed to fetch term types");
  }
});

router.get("/api/contracts/terms", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string | undefined;
    const type = req.query.type as string | undefined;
    const result = await service.getTerms({ page, limit, search, type });
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch terms");
  }
});

router.get("/api/contracts/terms/:id/history", async (req, res) => {
  try {
    const history = await service.getTermHistory(parseInt(req.params.id));
    res.json(history);
  } catch (error) {
    handleError(res, error, "Failed to fetch term history");
  }
});

router.get("/api/contracts/terms/:id", async (req, res) => {
  try {
    const term = await service.getTermById(parseInt(req.params.id));
    if (!term) return res.status(404).json({ error: "Term not found" });
    res.json(term);
  } catch (error) {
    handleError(res, error, "Failed to fetch term");
  }
});

router.post("/api/contracts/terms", async (req, res) => {
  try {
    const user = (req as any).user;
    const newId = await service.createTerm({ ...req.body, created_by: user?.email || user?.name });
    res.status(201).json({ success: true, id: newId });
    audit(req, String(newId), "CREATE", `Term created: ${req.body.terms_name}`);
  } catch (error) {
    handleError(res, error, "Failed to create term");
  }
});

router.put("/api/contracts/terms/:id", async (req, res) => {
  try {
    const user = (req as any).user;
    const updated = await service.updateTerm(parseInt(req.params.id), {
      ...req.body,
      last_modified_by: user?.email || user?.name,
    });
    if (!updated) return res.status(404).json({ error: "Term not found" });
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", `Term updated: ${req.params.id}`);
  } catch (error) {
    handleError(res, error, "Failed to update term");
  }
});

router.delete("/api/contracts/terms/:id", async (req, res) => {
  try {
    const deleted = await service.deleteTerm(parseInt(req.params.id));
    if (!deleted) return res.status(404).json({ error: "Term not found" });
    res.json({ success: true });
    audit(req, req.params.id, "DELETE", `Term deleted: ${req.params.id}`);
  } catch (error) {
    handleError(res, error, "Failed to delete term");
  }
});

// ── Create Contract ────────────────────────────────────────────────────────────
router.post("/api/contracts", async (req, res) => {
  try {
    const tenantPool = getPool();
    const user = (req as any).user;
    const {
      title, description, owner, owner_name, requestor_name,
      department, department_name, start_date, end_date,
      currency, project_name, project_ref_no, contract_amount, is_renewable,
      template_name,
    } = req.body;

    if (!title?.trim()) return res.status(400).json({ error: "Title is required" });
    if (!start_date)    return res.status(400).json({ error: "Start date is required" });
    if (!end_date)      return res.status(400).json({ error: "End date is required" });

    const newId = Math.floor(100000000 + Math.random() * 899999999);
    const createdBy = user?.email || user?.name || "system";
    const contractType = template_name?.trim() ? template_name.trim() : "Blank";

    await tenantPool.query(`
      INSERT INTO dbo.cm_header
        (id, title, description, owner, owner_name, requestor_name,
         department, department_name, start_date, end_date, currency,
         project_name, project_ref_no, contract_amount, is_renewable,
         status, type, template_name, creation_date, created_by)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'Draft',$16,$17,NOW(),$18)
    `, [
      newId, title, description || null, owner || createdBy, owner_name || createdBy,
      requestor_name || null, department || null, department_name || null,
      start_date, end_date, currency || "USD",
      project_name || null, project_ref_no || null,
      contract_amount ? parseFloat(contract_amount) : null,
      is_renewable || null, contractType, template_name?.trim() || null, createdBy,
    ]);

    // ── Copy template clauses into the new contract ────────────────────────────
    if (template_name?.trim()) {
      const { rows: tmplRows } = await tenantPool.query(
        `SELECT id FROM dbo.cm_template WHERE template_name = $1 LIMIT 1`,
        [template_name.trim()]
      );
      if (tmplRows.length > 0) {
        const templateId = tmplRows[0].id;
        const { rows: clauseRows } = await tenantPool.query(
          `SELECT section_id, section_name, description, html_content, clause_mandatory,
                  clause_ammendable, clause_negotiable, orderby
           FROM dbo.cm_sections WHERE template_id = $1 ORDER BY COALESCE(orderby, 9999)`,
          [templateId]
        );
        for (let i = 0; i < clauseRows.length; i++) {
          const c = clauseRows[i];
          const clauseId = Math.floor(Date.now() / 1000) + i + Math.floor(Math.random() * 999);
          await tenantPool.query(
            `INSERT INTO dbo.cm_contracts_terms
               (id, contractrefno, terms_name, term_details, terms_id,
                mandatory, term_amendable, term_negotiable, order_by, created_by, creation_date, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),'Active')`,
            [
              clauseId, newId,
              c.section_name || "Clause",
              c.html_content || c.description || "",
              c.section_id,
              c.clause_mandatory || "No",
              c.clause_ammendable || "Yes",
              c.clause_negotiable || "Yes",
              i + 1,
              createdBy,
            ]
          );
        }
      }
    }

    res.json({ id: newId, status: "Draft", clausesCopied: true });

    audit(req, String(newId), "CREATE", `Contract created: ${title}`);
  } catch (error) {
    handleError(res, error, "Failed to create contract");
  }
});

// ── Create Contract from PR ────────────────────────────────────────────────────
router.get("/api/contracts/pr-details/:prNumber", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { rows: headerRows } = await tenantPool.query(
      `SELECT * FROM dbo.supp_pr_header_dtls WHERE pr_number = $1`,
      [req.params.prNumber]
    );
    if (!headerRows.length) return res.status(404).json({ error: "PR not found" });
    const { rows: lines } = await tenantPool.query(
      `SELECT * FROM dbo.supp_pr_line_dtls WHERE pr_number = $1 ORDER BY line_num`,
      [req.params.prNumber]
    );
    res.json({ header: headerRows[0], lines });
  } catch (error) { handleError(res, error, "Failed to fetch PR details"); }
});

router.post("/api/contracts/from-pr", async (req, res) => {
  try {
    const tenantPool = getPool();
    const user = (req as any).user;
    const {
      prNumber, supplierId, selectedLines, title, start_date, end_date,
      currency, template_name, is_renewable,
    } = req.body;

    if (!prNumber)   return res.status(400).json({ error: "PR number is required" });
    if (!supplierId) return res.status(400).json({ error: "Supplier is required" });
    if (!start_date) return res.status(400).json({ error: "Start date is required" });
    if (!end_date)   return res.status(400).json({ error: "End date is required" });
    if (!selectedLines || !String(selectedLines).trim())
      return res.status(400).json({ error: "Please select at least one PR line" });

    const { rows: headerRows } = await tenantPool.query(
      `SELECT * FROM dbo.supp_pr_header_dtls WHERE pr_number = $1`,
      [prNumber]
    );
    if (!headerRows.length) return res.status(404).json({ error: "PR not found" });
    const prHeader = headerRows[0];

    const selectedIds = String(selectedLines).split("~").filter(Boolean);
    const { rows: allLines } = await tenantPool.query(
      `SELECT * FROM dbo.supp_pr_line_dtls WHERE pr_number = $1 ORDER BY line_num`,
      [prNumber]
    );
    const prLines = allLines.filter((l: any) => selectedIds.includes(String(l.id)));
    if (!prLines.length) return res.status(400).json({ error: "Please select at least one PR line" });

    const createdBy = user?.email || user?.name || "system";
    const newId = Math.floor(100000000 + Math.random() * 899999999);
    const contractTitle = title?.trim() || prHeader.pr_description || `Contract for ${prNumber}`;
    const contractType = template_name?.trim() ? template_name.trim() : "Blank";
    const contractAmount = prLines.reduce((sum: number, l: any) =>
      sum + (parseFloat(l.qty || "0") || 0) * (parseFloat(l.unit_cost || "0") || 0), 0);

    await tenantPool.query(`
      INSERT INTO dbo.cm_header
        (id, title, description, owner, owner_name, requestor_name,
         department, department_name, start_date, end_date, currency,
         project_ref_no, contract_amount, is_renewable,
         status, type, template_name, creation_date, created_by)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Draft',$15,$16,NOW(),$17)
    `, [
      newId, contractTitle, prHeader.pr_description || null, createdBy, createdBy,
      prHeader.requestor_name || null,
      prHeader.department_name || null, prHeader.department_name || null,
      start_date, end_date, currency || prHeader.currency || "USD",
      prNumber, contractAmount || null, is_renewable?.trim() || null,
      contractType, template_name?.trim() || null, createdBy,
    ]);

    // ── Copy template clauses into the new contract ────────────────────────────
    if (template_name?.trim()) {
      const { rows: tmplRows } = await tenantPool.query(
        `SELECT id FROM dbo.cm_template WHERE template_name = $1 LIMIT 1`,
        [template_name.trim()]
      );
      if (tmplRows.length > 0) {
        const templateId = tmplRows[0].id;
        const { rows: clauseRows } = await tenantPool.query(
          `SELECT section_id, section_name, description, html_content, clause_mandatory,
                  clause_ammendable, clause_negotiable, orderby
           FROM dbo.cm_sections WHERE template_id = $1 ORDER BY COALESCE(orderby, 9999)`,
          [templateId]
        );
        for (let i = 0; i < clauseRows.length; i++) {
          const c = clauseRows[i];
          const clauseId = Math.floor(Date.now() / 1000) + i + Math.floor(Math.random() * 999);
          await tenantPool.query(
            `INSERT INTO dbo.cm_contracts_terms
               (id, contractrefno, terms_name, term_details, terms_id,
                mandatory, term_amendable, term_negotiable, order_by, created_by, creation_date, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),'Active')`,
            [
              clauseId, newId,
              c.section_name || "Clause",
              c.html_content || c.description || "",
              c.section_id,
              c.clause_mandatory || "No",
              c.clause_ammendable || "Yes",
              c.clause_negotiable || "Yes",
              i + 1,
              createdBy,
            ]
          );
        }
      }
    }

    // ── Supplier assignment (mirrors POST /api/contracts/:id/vendor) ───────────
    const { rows: contacts } = await tenantPool.query(
      `SELECT contact_name, email, phone, mobile FROM dbo.supp_contact_dtls
       WHERE supplier_id = $1 AND LOWER(is_primary) IN ('yes','true','1') LIMIT 1`,
      [supplierId]
    );
    const { rows: supplierRows } = await tenantPool.query(
      `SELECT company_name FROM dbo.supp_basic_org_dtls WHERE id = $1`,
      [supplierId]
    );
    const primary = contacts[0];
    const supplierName = supplierRows[0]?.company_name || null;
    const supplierDtlsId = Math.floor(Math.random() * 900000000) + 100000000;
    await tenantPool.query(`
      INSERT INTO dbo.cm_supplier_dtls (id, contractrefno, supplier_id, supplier_name, supplier_contact, supplier_contact_no, supplier_contact_email, created_by, creation_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    `, [
      supplierDtlsId, newId, supplierId, supplierName,
      primary?.contact_name || null, primary?.phone || primary?.mobile || null, primary?.email || null,
      createdBy,
    ]);

    // ── Scope of Work from the selected PR lines ────────────────────────────────
    for (let i = 0; i < prLines.length; i++) {
      const line = prLines[i];
      const sowId = Math.floor(Date.now() / 1000) + i + Math.floor(Math.random() * 9999) + 1000;
      const qty = parseFloat(line.qty || "0") || 0;
      const unitCost = parseFloat(line.unit_cost || "0") || 0;
      await tenantPool.query(
        `INSERT INTO dbo.cm_sow (id, parent_id, description, quantity, uom, unit_cost, total_cost, deliverydate, type, item_id, item_name, category_code, category_name, del_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'N')`,
        [
          sowId, newId, line.item_description || null, qty || null, line.uom || null, unitCost || null,
          (qty * unitCost) || null, line.need_by_date || null, line.line_type || "Goods",
          line.item_id || null, line.item_description || null, line.product_category || null, line.product_category_name || null,
        ]
      );
      // Mark the PR line as consumed by this contract (mirrors po_number on supp_pr_line_dtls,
      // using the spare attribute_15 slot since there's no dedicated contract-ref column).
      await tenantPool.query(
        `UPDATE dbo.supp_pr_line_dtls SET attribute_15 = $1 WHERE id = $2`,
        [String(newId), line.id]
      );
    }

    // Traceability back to the PR is via cm_header.project_ref_no (set above) —
    // matches the convention already used by the AI contracting co-pilot's "from PR" path.

    res.json({ id: newId, status: "Draft" });
    audit(req, String(newId), "CREATE", `Contract created from PR ${prNumber}`);
  } catch (error) {
    handleError(res, error, "Failed to create contract from PR");
  }
});

// ── Contract Templates (cm_template) ─────────────────────────────────────────
router.get("/api/contracts/templates", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { search = "", page = "1", limit = "20" } = req.query as any;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const searchParam = `%${search}%`;
    const { rows } = await tenantPool.query(
      `SELECT t.id, t.template_name, t.template_description,
              COUNT(s.section_id) AS section_count
       FROM dbo.cm_template t
       LEFT JOIN dbo.cm_sections s ON s.template_id = t.id
       WHERE (t.template_name ILIKE $1 OR t.template_description ILIKE $1)
       GROUP BY t.id, t.template_name, t.template_description
       ORDER BY t.id DESC
       LIMIT $2 OFFSET $3`,
      [searchParam, parseInt(limit), offset]
    );
    const { rows: countRows } = await tenantPool.query(
      `SELECT COUNT(*) FROM dbo.cm_template WHERE template_name ILIKE $1 OR template_description ILIKE $1`,
      [searchParam]
    );
    res.json({ records: rows, total: parseInt(countRows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (error) { handleError(res, error, "Failed to fetch templates"); }
});

router.post("/api/contracts/templates", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { template_name, template_description } = req.body;
    if (!template_name?.trim()) return res.status(400).json({ error: "Template name is required" });
    const { rows } = await tenantPool.query(
      `INSERT INTO dbo.cm_template (template_name, template_description) VALUES ($1, $2) RETURNING *`,
      [template_name.trim(), template_description?.trim() || null]
    );
    res.status(201).json(rows[0]);
    const audit = () => { try { const { logAudit } = require("../administration/administration.service"); logAudit({ audit_action: "CREATE", module: "Contracts", audit_message: `Contract template created: ${template_name}`, audit_key: String(rows[0].id), req }); } catch {} };
    audit();
  } catch (error) { handleError(res, error, "Failed to create template"); }
});

router.put("/api/contracts/templates/:id", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;
    const { template_name, template_description } = req.body;
    if (!template_name?.trim()) return res.status(400).json({ error: "Template name is required" });
    const { rows } = await tenantPool.query(
      `UPDATE dbo.cm_template SET template_name = $1, template_description = $2 WHERE id = $3 RETURNING *`,
      [template_name.trim(), template_description?.trim() || null, id]
    );
    if (!rows.length) return res.status(404).json({ error: "Template not found" });
    res.json(rows[0]);
    const audit = () => { try { const { logAudit } = require("../administration/administration.service"); logAudit({ audit_action: "UPDATE", module: "Contracts", audit_message: `Contract template updated: ${template_name}`, audit_key: id, req }); } catch {} };
    audit();
  } catch (error) { handleError(res, error, "Failed to update template"); }
});

router.delete("/api/contracts/templates/:id", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;
    const { rows: check } = await tenantPool.query(
      `SELECT COUNT(*) FROM dbo.cm_sections WHERE template_id = $1`, [id]
    );
    if (parseInt(check[0].count) > 0) {
      return res.status(400).json({ error: `Cannot delete — this template has ${check[0].count} section(s) linked to it. Remove the sections first.` });
    }
    const { rows } = await tenantPool.query(`DELETE FROM dbo.cm_template WHERE id = $1 RETURNING template_name`, [id]);
    if (!rows.length) return res.status(404).json({ error: "Template not found" });
    res.json({ success: true });
    const audit = () => { try { const { logAudit } = require("../administration/administration.service"); logAudit({ audit_action: "DELETE", module: "Contracts", audit_message: `Contract template deleted: ${rows[0].template_name}`, audit_key: id, req }); } catch {} };
    audit();
  } catch (error) { handleError(res, error, "Failed to delete template"); }
});

// ── Template GET by ID + Section CRUD ────────────────────────────────────────
router.get("/api/contracts/templates/:id", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;
    const { rows } = await tenantPool.query(
      `SELECT t.id, t.template_name, t.template_description,
              COUNT(s.section_id) AS section_count
       FROM dbo.cm_template t
       LEFT JOIN dbo.cm_sections s ON s.template_id = t.id
       WHERE t.id = $1
       GROUP BY t.id, t.template_name, t.template_description`, [id]
    );
    if (!rows.length) return res.status(404).json({ error: "Template not found" });
    res.json(rows[0]);
  } catch (error) { handleError(res, error, "Failed to fetch template"); }
});

router.get("/api/contracts/templates/:id/sections", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;
    const { rows } = await tenantPool.query(
      `SELECT section_id, section_name, section_type, description, html_content,
              clause_ammendable, clause_negotiable, clause_mandatory, orderby
       FROM dbo.cm_sections WHERE template_id = $1
       ORDER BY COALESCE(orderby, 9999), section_id`, [id]
    );
    res.json(rows);
  } catch (error) { handleError(res, error, "Failed to fetch template sections"); }
});

router.post("/api/contracts/templates/:id/sections", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;
    const user = (req as any).user;
    const createdBy = user?.email || user?.name || "system";
    const { section_name, section_type, description, html_content,
            clause_ammendable, clause_negotiable, clause_mandatory, orderby } = req.body;
    const idResult = await tenantPool.query(
      `SELECT COALESCE(MAX(section_id), 380000000) + 1 AS next_id FROM dbo.cm_sections`
    );
    const newId = idResult.rows[0].next_id;
    const { rows } = await tenantPool.query(
      `INSERT INTO dbo.cm_sections
         (section_id, section_name, section_type, description, html_content,
          clause_ammendable, clause_negotiable, clause_mandatory, orderby,
          template_id, created_by, creation_date, last_modified_by, last_modified_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$11,NOW()) RETURNING *`,
      [newId, section_name || "New Clause", section_type || "Custom",
       description || null, html_content || null,
       clause_ammendable || "No", clause_negotiable || "No",
       clause_mandatory || "No", orderby || null, id, createdBy]
    );
    res.status(201).json(rows[0]);
    audit(req, id, "CREATE", `Template clause added: ${section_name || "New Clause"}`);
  } catch (error) { handleError(res, error, "Failed to add template section"); }
});

router.put("/api/contracts/templates/:id/sections/:sectionId", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id, sectionId } = req.params;
    const user = (req as any).user;
    const modifiedBy = user?.email || user?.name || "system";
    const { section_name, html_content, description, section_type,
            clause_ammendable, clause_negotiable, clause_mandatory } = req.body;
    const { rows } = await tenantPool.query(
      `UPDATE dbo.cm_sections SET
         section_name = COALESCE($1, section_name),
         html_content = COALESCE($2, html_content),
         description = COALESCE($3, description),
         section_type = COALESCE($4, section_type),
         clause_ammendable = COALESCE($5, clause_ammendable),
         clause_negotiable = COALESCE($6, clause_negotiable),
         clause_mandatory = COALESCE($7, clause_mandatory),
         last_modified_by = $8, last_modified_date = NOW()
       WHERE section_id = $9 AND template_id = $10 RETURNING *`,
      [section_name, html_content, description, section_type,
       clause_ammendable, clause_negotiable, clause_mandatory,
       modifiedBy, sectionId, id]
    );
    if (!rows.length) return res.status(404).json({ error: "Section not found" });
    res.json(rows[0]);
    audit(req, id, "UPDATE", `Template clause updated: ${section_name}`);
  } catch (error) { handleError(res, error, "Failed to update template section"); }
});

router.delete("/api/contracts/templates/:id/sections/:sectionId", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id, sectionId } = req.params;
    const { rows } = await tenantPool.query(
      `DELETE FROM dbo.cm_sections WHERE section_id = $1 AND template_id = $2 RETURNING section_name`, [sectionId, id]
    );
    if (!rows.length) return res.status(404).json({ error: "Section not found" });
    res.json({ success: true });
    audit(req, id, "DELETE", `Template clause removed: ${rows[0].section_name}`);
  } catch (error) { handleError(res, error, "Failed to delete template section"); }
});

router.post("/api/contracts/templates/:id/copy", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;
    const { rows: src } = await tenantPool.query(
      `SELECT template_name, template_description FROM dbo.cm_template WHERE id = $1`, [id]
    );
    if (!src.length) return res.status(404).json({ error: "Template not found" });
    const newName = `${src[0].template_name} (Copy)`;
    const { rows } = await tenantPool.query(
      `INSERT INTO dbo.cm_template (template_name, template_description) VALUES ($1, $2) RETURNING *`,
      [newName, src[0].template_description]
    );
    res.json(rows[0]);
    const audit = () => { try { const { logAudit } = require("../administration/administration.service"); logAudit({ audit_action: "CREATE", module: "Contracts", audit_message: `Contract template copied: ${newName}`, audit_key: String(rows[0].id), req }); } catch {} };
    audit();
  } catch (error) { handleError(res, error, "Failed to copy template"); }
});

// ── Contracts List (cm_header) ────────────────────────────────────────────────
router.get("/api/contracts/list", async (req, res) => {
  try {
    const tenantPool = getPool();
    const sessionUser = (req as any).user;
    const userRole: string = sessionUser?.userRole || "";
    const isSuperAdmin = userRole === "ROLE_SUPERADMIN" || userRole === "SUPERADMIN";
    const userId: string = String(sessionUser?.id || 0);
    const userName: string = sessionUser?.userName || "";
    const userEmail: string = sessionUser?.email || "";

    const params: any[] = [];
    let visibilityFilter = "";
    if (!isSuperAdmin) {
      // $1 = userId, $2 = userName (login), $3 = email
      params.push(userId, userName, userEmail);
      visibilityFilter = `
        AND (
          h.owner = $1
          OR h.owner = $2
          OR h.owner = $3
          OR EXISTS (
            SELECT 1 FROM dbo.cm_approvers a
            WHERE a.contractrefno = h.id
              AND a.user_id::text = $1
              AND a.teamtype = 'Review Team'
          )
        )`;
    }

    // Auto-expire any contracts whose end_date has passed
    await tenantPool.query(`
      UPDATE dbo.cm_header
      SET status = 'Expired', last_modified_date = NOW()
      WHERE end_date IS NOT NULL
        AND end_date < CURRENT_DATE
        AND status NOT IN ('Expired', 'Terminated', 'Cancelled', 'Deleted')
    `);

    const { rows } = await tenantPool.query(`
      SELECT
        h.id,
        h.title,
        h.status,
        h.type,
        h.contr_ref_no,
        h.contract_amount,
        h.owner,
        h.department_name,
        h.start_date,
        h.end_date,
        h.creation_date,
        h.created_by,
        h.requestor_name,
        h.bid_ref_no,
        h.version,
        h.template_name,
        h.description,
        h.last_modified_date,
        h.currency,
        COALESCE(
          (SELECT string_agg(sd.supplier_name, ', ')
           FROM dbo.cm_supplier_dtls sd
           WHERE sd.contractrefno = h.id),
          ''
        ) AS vendor_names,
        COALESCE(
          (SELECT bool_and(s.po_number IS NOT NULL)
           FROM dbo.cm_sow s
           WHERE s.parent_id = h.id AND (s.del_status IS NULL OR s.del_status != 'Y')),
          false
        ) AS all_lines_have_po,
        (SELECT string_agg(DISTINCT s.po_number, ', ')
         FROM dbo.cm_sow s
         WHERE s.parent_id = h.id AND s.po_number IS NOT NULL
           AND (s.del_status IS NULL OR s.del_status != 'Y')
        ) AS po_numbers
      FROM dbo.cm_header h
      WHERE 1=1 ${visibilityFilter}
      ORDER BY h.creation_date DESC
    `, params);
    res.json(rows);
  } catch (error) {
    handleError(res, error, "Failed to fetch contracts list");
  }
});

// ── Supplier-facing Contracts List ───────────────────────────────────────────
router.get("/api/contracts/supplier/list", async (req, res) => {
  try {
    const tenantPool = getPool();
    const sessionUser = (req as any).user;
    const userRole: string = sessionUser?.userRole || "";
    const isSupplier = userRole === "ROLE_SUPPLIER_ADMIN" || userRole === "ROLE_SUPPLIER_USER";

    if (!isSupplier || !sessionUser?.supplierId) {
      return res.status(403).json({ error: "Access denied - supplier role required" });
    }

    const supplierId = Number(sessionUser.supplierId);

    // Auto-expire any contracts whose end_date has passed (regardless of current status)
    await tenantPool.query(`
      UPDATE dbo.cm_header
      SET status = 'Expired', last_modified_date = NOW()
      WHERE end_date IS NOT NULL
        AND end_date < CURRENT_DATE
        AND status NOT IN ('Expired', 'Terminated', 'Cancelled', 'Deleted')
        AND id IN (
          SELECT contractrefno FROM dbo.cm_supplier_dtls WHERE supplier_id = $1
        )
    `, [supplierId]);

    const { rows } = await tenantPool.query(`
      SELECT
        h.id,
        h.title,
        h.status,
        h.type,
        h.contr_ref_no,
        h.contract_amount,
        h.owner,
        h.department_name,
        h.start_date,
        h.end_date,
        h.creation_date,
        h.last_modified_date,
        h.requestor_name,
        h.version,
        h.description,
        sd.supplier_name,
        sd.supplier_site,
        sd.supplier_contact,
        sd.supplier_contact_email
      FROM dbo.cm_header h
      INNER JOIN dbo.cm_supplier_dtls sd
        ON sd.contractrefno = h.id
        AND sd.supplier_id = $1
      ORDER BY COALESCE(h.last_modified_date, h.creation_date) DESC NULLS LAST
    `, [supplierId]);

    res.json(rows);
  } catch (error) {
    handleError(res, error, "Failed to fetch supplier contracts");
  }
});

router.get("/api/contracts/list/stats", async (req, res) => {
  try {
    const tenantPool = getPool();
    const sessionUser = (req as any).user;
    const userRole: string = sessionUser?.userRole || "";
    const isSuperAdmin = userRole === "ROLE_SUPERADMIN" || userRole === "SUPERADMIN";
    const userId: string = String(sessionUser?.id || 0);
    const userName: string = sessionUser?.userName || "";
    const userEmail: string = sessionUser?.email || "";

    const params: any[] = [];
    let visibilityFilter = "";
    if (!isSuperAdmin) {
      params.push(userId, userName, userEmail);
      visibilityFilter = `
        AND (
          h.owner = $1
          OR h.owner = $2
          OR h.owner = $3
          OR EXISTS (
            SELECT 1 FROM dbo.cm_approvers a
            WHERE a.contractrefno = h.id
              AND a.user_id::text = $1
              AND a.teamtype = 'Review Team'
          )
        )`;
    }

    const { rows } = await tenantPool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE h.status IN ('Active','Approved','Signed','Accepted')) AS active_contracts,
        COUNT(*) FILTER (WHERE h.status IN ('Under Negotiation','Vendor Submit For Negotiation','Supplier Submit For Negotiation')) AS in_negotiation,
        COUNT(*) FILTER (WHERE h.end_date BETWEEN NOW() AND NOW() + INTERVAL '30 days') AS expiring_soon,
        COUNT(*) FILTER (WHERE h.status IN ('Pending Approval','Pending Termination','More Info Required for Termination')) AS pending_action
      FROM dbo.cm_header h
      WHERE 1=1 ${visibilityFilter}
    `, params);
    res.json(rows[0]);
  } catch (error) {
    handleError(res, error, "Failed to fetch contracts stats");
  }
});

// ── Delete Contract ────────────────────────────────────────────────────────────
router.delete("/api/contracts/:id", async (req, res) => {
  try {
    const tenantPool = getPool();
    const user = (req as any).user;
    const { id } = req.params;
    const { rows, rowCount } = await tenantPool.query(
      `UPDATE dbo.cm_header SET status = 'Deleted', last_modified_by = $2, last_modified_date = NOW()
       WHERE id = $1 RETURNING id, title`,
      [id, user?.email || user?.name || "system"]
    );
    if (!rowCount) return res.status(404).json({ error: "Contract not found" });
    res.json({ success: true });
    audit(req, id, "DELETE", `Contract soft-deleted: ${rows[0]?.title || id}`);
  } catch (error) {
    handleError(res, error, "Failed to delete contract");
  }
});

// ── Update Contract Header ─────────────────────────────────────────────────────
router.patch("/api/contracts/:id", async (req, res) => {
  try {
    const tenantPool = getPool();
    const user = (req as any).user;
    const { id } = req.params;
    const {
      title, description, owner, owner_name, requestor_name,
      department, department_name, start_date, end_date,
      currency, project_name, project_ref_no, contract_amount, is_renewable,
    } = req.body;

    if (!title?.trim()) return res.status(400).json({ error: "Title is required" });
    if (!start_date)    return res.status(400).json({ error: "Start date is required" });
    if (!end_date)      return res.status(400).json({ error: "End date is required" });

    const modifiedBy = user?.email || user?.name || "system";
    const { rows, rowCount } = await tenantPool.query(`
      UPDATE dbo.cm_header SET
        title = $1, description = $2, owner = $3, owner_name = $4,
        requestor_name = $5, department = $6, department_name = $7,
        start_date = $8, end_date = $9, currency = $10,
        project_name = $11, project_ref_no = $12,
        contract_amount = $13, is_renewable = $14,
        last_modified_by = $15, last_modified_date = NOW()
      WHERE id = $16
      RETURNING id, title, status
    `, [
      title.trim(), description || null, owner || modifiedBy, owner_name || modifiedBy,
      requestor_name || null, department || null, department_name || null,
      start_date, end_date, currency || "USD",
      project_name || null, project_ref_no || null,
      contract_amount ? parseFloat(contract_amount) : null,
      is_renewable || null, modifiedBy, id,
    ]);

    if (!rowCount) return res.status(404).json({ error: "Contract not found" });
    res.json(rows[0]);

    audit(req, id, "UPDATE", `Contract updated: ${title}`);
  } catch (error) {
    handleError(res, error, "Failed to update contract");
  }
});

// ── Submit Contract for Review ─────────────────────────────────────────────────
router.patch("/api/contracts/:id/submit", async (req, res) => {
  try {
    const tenantPool = getPool();
    const user = (req as any).user;
    const { id } = req.params;

    // 1. Fetch current contract header
    const { rows: hdrRows } = await tenantPool.query(
      `SELECT id, status, appr_status, curr_appr_comments FROM dbo.cm_header WHERE id = $1`, [id]
    );
    if (!hdrRows.length) return res.status(404).json({ error: "Contract not found" });
    const contract = hdrRows[0];
    if (!["Draft", "Review Completed", "Review Rejected", "More Info Required"].includes(contract.status)) {
      return res.status(400).json({ error: "Contract is not in a submittable status" });
    }

    // 2. Get review team members sorted by id (approximates level order)
    const { rows: reviewers } = await tenantPool.query(`
      SELECT ca.id, ca.user_id, u.user_name, u.name, u.email_id
      FROM dbo.cm_approvers ca
      LEFT JOIN dbo.um_user_dtls u ON u.id::text = ca.user_id::text
      WHERE ca.contractrefno = $1 AND LOWER(ca.teamtype) = 'review team'
      ORDER BY ca.id ASC
    `, [id]);

    // 3. Validate at least one reviewer exists
    if (!reviewers.length) {
      return res.status(400).json({
        error: "Please add at least one Review Team member before submitting for review"
      });
    }

    // 4. Update all reviewers: review_required=Y, accepted=N, rejected=N
    for (const reviewer of reviewers) {
      await tenantPool.query(
        `UPDATE dbo.cm_approvers SET review_required = 'Y', accepted_contract = 'N', rejected_contract = 'N' WHERE id = $1`,
        [reviewer.id]
      );
    }

    // 5. Build header update — first reviewer drives appr_process_id
    const firstReviewer = reviewers[0];
    const apprProcessId = firstReviewer.user_name || firstReviewer.name || String(firstReviewer.user_id);

    // 6. Clear appr_status/comments for re-submissions
    const clearApprStatus = contract.appr_status === "Rejected" ? null : contract.appr_status;
    const clearComments   = ["Rejected", "More Info Required"].includes(contract.appr_status)
      ? null : contract.curr_appr_comments;

    // 7. Update contract header
    const modifiedBy = user?.email || user?.name || "system";
    const { rows: updated } = await tenantPool.query(`
      UPDATE dbo.cm_header SET
        status = 'Under Review',
        appr_process_id = $2,
        appr_status = $3,
        curr_appr_comments = $4,
        rev_flag = 'Y',
        last_modified_by = $5,
        last_modified_date = NOW()
      WHERE id = $1
      RETURNING id, status
    `, [id, apprProcessId, clearApprStatus, clearComments, modifiedBy]);

    res.json(updated[0]);

    audit(
      req,
      id,
      "UPDATE",
      contract.status === "More Info Required"
        ? `Contract re-submitted for review: ${id}`
        : `Contract submitted for review: ${id}`
    );
    if(contract.status === "More Info Required"){
      await insertReviewHistory(tenantPool, id, user, "ReSubmit", "");
    }

    // Notify each review team member by email (non-blocking)
    (async () => {
      try {
        const { emailService } = await import("../../services/emailService");
        for (const reviewer of reviewers) {
          const email = reviewer.email_id?.trim();
          if (!email) continue;
          await emailService.sendTemplatedEmail(
            "PUBLISH_CONTRACT_REVIEW",
            email,
            {
              name: reviewer.name || reviewer.user_name || email,
              taskTitle: `Contract Review Request - ${id}`,
              submittedBy: modifiedBy,
              contractId: String(id),
            }
          );
        }
      } catch (e) {
        console.error("[contracts] Failed to send review notification:", e);
      }
    })();
  } catch (error) {
    handleError(res, error, "Failed to submit contract for review");
  }
});

// ── Process Approval (workflow-integrated: Approve / Reject / More Info Required) ──
// Mirrors Java's processContractApprovalStep:
//  1. Advances the workflow via completeTask(taskId)
//  2. If more steps remain (newTaskId != "") → contract stays "Pending Approval", saves next taskId to attribute_12
//  3. If final Approve step (newTaskId == "") → marks contract "Approved", saves org-signer details
//  4. Reject → sets "Rejected", clears approvers_list
//  5. More Info Required → routes task back to initiator, sets "More Info Required"
//  6. Always inserts an approval-history row into supp_regstr_appr_dtls
router.patch("/api/contracts/:id/process-approval", async (req, res) => {
  try {
    const { workflowService } = await import("../../services/workflowService");
    const tenantPool = getPool();
    const sessionUser = (req as any).user;
    const { id } = req.params;
    const { action, remarks, taskId: bodyTaskId } = req.body as {
      action: "Approve" | "Reject" | "More" | "ReSubmit";
      remarks?: string;
      taskId?: string;
    };
    const orgData = await adminRepo.getOrgDetails();
    if (!["Approve", "Reject", "More", "ReSubmit"].includes(action)) {
      return res.status(400).json({ error: "Invalid action. Must be Approve, Reject, More, or ReSubmit." });
    }

    // ── 1. Load contract ────────────────────────────────────────────────────────
    const { rows: hdrRows } = await tenantPool.query(
      `SELECT id, status, title, contract_amount, attribute_12, approvers_list, appr_status
       FROM dbo.cm_header WHERE id = $1`,
      [id]
    );
    if (!hdrRows.length) return res.status(404).json({ error: "Contract not found" });
    const contract = hdrRows[0];

    // ── 2. Resolve taskId (from request body, or fall back to attribute_12 on contract) ──
    const taskId: string | null = bodyTaskId || contract.attribute_12 || null;

    // ── 3. Resolve acting user's full profile for audit/history record ──────────
    const userName: string = sessionUser?.userName || sessionUser?.email || "system";
    const userRoles: string[] = sessionUser?.userRole ? [sessionUser.userRole] : [];
    const { rows: userRows } = await tenantPool.query(
      `SELECT id, name, email_id, designation FROM dbo.um_user_dtls
       WHERE user_name = $1 OR email_id = $1 LIMIT 1`,
      [userName]
    );
    const actingUser = userRows[0] || { id: 0, name: userName, email_id: userName, designation: null };

    // ── 4. Capture task creation date for the history record (requested_date) ───
    // UNION ALL aliases second column to first query's column name (create_time_)
    let taskCreationDate: Date = new Date();
    if (taskId) {
      const { rows: taskRows } = await tenantPool.query(
        `SELECT create_time_ AS task_date FROM dbo.act_ru_task WHERE id_ = $1
         UNION ALL
         SELECT start_time_ AS task_date FROM dbo.act_hi_taskinst WHERE id_ = $1
         LIMIT 1`,
        [taskId]
      );
      if (taskRows.length > 0 && taskRows[0].task_date) {
        taskCreationDate = taskRows[0].task_date;
      }
    }

    // ── 5. Advance the workflow engine ──────────────────────────────────────────
    // completeTask returns newTaskId: non-empty = more steps remain, "" = workflow complete
    let newTaskId = "";

    if (action === "ReSubmit") {
      // Re-submit after More Info Required: start a FRESH workflow process so the full
      // multi-step approval chain runs from step 1 again, cleanly.

      // Close out the existing "More Info Required" task so it does not remain active
      // alongside the new approver task. Without this cleanup, the is_approver query
      // (LIMIT 1, no ORDER BY) may return the old buyer task and grant approval actions
      // to the buyer while the approver sees nothing.
      if (taskId) {
        await tenantPool.query(
          `INSERT INTO dbo.act_hi_taskinst
             (id_, proc_def_id_, task_def_key_, proc_inst_id_, name_, assignee_,
              start_time_, end_time_, duration_, priority_, tenant_id_)
           SELECT id_, proc_def_id_, task_def_key_, proc_inst_id_, name_, assignee_,
                  create_time_, NOW(),
                  EXTRACT(EPOCH FROM (NOW() - create_time_)) * 1000,
                  priority_, tenant_id_
           FROM dbo.act_ru_task WHERE id_ = $1
           ON CONFLICT (id_) DO UPDATE SET
             end_time_ = NOW(),
             duration_ = EXTRACT(EPOCH FROM (NOW() - dbo.act_hi_taskinst.start_time_)) * 1000`,
          [taskId]
        );
        await tenantPool.query(`DELETE FROM dbo.act_ru_task WHERE id_ = $1`, [taskId]);
        await tenantPool.query(
          `UPDATE dbo.wf_step_instance
           SET status = 'Completed', action_by = $1, action_date = NOW(), result = 'ReSubmit'
           WHERE task_id = $2 AND status = 'Ready'`,
          [userName, taskId]
        );
      }

      const { rows: fullHdr } = await tenantPool.query(
        `SELECT id, status, title, contr_ref_no, contract_amount, department_name, org_name
         FROM dbo.cm_header WHERE id = $1`, [id]
      );
      const fullContract = fullHdr[0] || contract;
      const { rows: userRows2 } = await tenantPool.query(
        `SELECT 
          u.id,
          u.name,
          u.department_name,
          COALESCE(u.attribute_13, o.organization_name, '') AS org_name
        FROM dbo.um_user_dtls u
        LEFT JOIN dbo.um_org_dtls o ON o.id = u.org_id
        WHERE u.user_name = $1 OR u.email_id = $1
        LIMIT 1`,
        [userName]
      );
      const userDetails2 = userRows2[0] || {};
      const refLabel2 = fullContract.contr_ref_no || String(fullContract.id);
      let taskSubject2 = `Contract Approval Request - ${refLabel2} - ${fullContract.title || ""}`;
      if (taskSubject2.length > 200) taskSubject2 = taskSubject2.substring(0, 200);
      const resubmitParams: Record<string, any> = {
        subject: taskSubject2,
        srmsRefNumber: String(id),
        status: "Pending Approval",
        startDate: new Date().getTime(),
        createdBy: userDetails2.name || userName,
        organization: userDetails2.org_name || fullContract.org_name || "",
        department: userDetails2.department_name || fullContract.department_name || "",
        amount: fullContract.contract_amount != null ? String(fullContract.contract_amount) : "0",
      };
      newTaskId = await workflowService.startProcess(taskSubject2, "Contract", String(id), resubmitParams, userName);
      const newApproversList2 = (await workflowService.getApproversList("Contract", resubmitParams)).join(", ");
      await tenantPool.query(`
        UPDATE dbo.cm_header SET
          status = 'Pending Approval', appr_status = NULL, curr_appr_comments = NULL,
          attribute_12 = $2, approvers_list = $3,
          last_modified_by = $4, last_modified_date = NOW()
        WHERE id = $1
      `, [id, newTaskId, newApproversList2, userName]);
      // Insert history row for ReSubmit
      await tenantPool.query(`
        INSERT INTO dbo.supp_regstr_appr_dtls
          (object_id, supplier_id, approver_id, approver_name,
           attribute_9, attribute_10, status, comments, requested_date, approved_date, attribute_1)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10)
      `, [String(id), 0, actingUser.id, actingUser.name,
          actingUser.email_id, actingUser.designation || null, "ReSubmit",
          remarks || null, taskCreationDate, "CONTRACT"]);
      res.json({ id, status: "Pending Approval", newTaskId });
      audit(req, id, "UPDATE", `Contract re-submitted for approval by ${userName}`);
      if (newTaskId) {
        
        const approverEmail = await getPool().query(`select current_assignee from dbo.wf_step_instance where task_id=${newTaskId}`);
            const appUrl = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
            const apiKey = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);
            const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(String(apiKey.rows[0].prop_value))}&&module=${encodeURIComponent('contract')}&&taskId=${encodeURIComponent(newTaskId)}&&email=${encodeURIComponent(String(approverEmail.rows[0].current_assignee))}&&refnumber=${encodeURIComponent(id)}`;
        const { publishTaskAssignmentEvent } = await import("../../services/eventBus/publishTaskAssignment");
        publishTaskAssignmentEvent({
          taskId: newTaskId,
          templateEventId: "CONTRACT_APPROVAL",
          taskSub: taskSubject2,
          submittedBy: actingUser.name || userName,
          department: userDetails2.department_name || "",
          srmsRefNo: String(id),
          variables: {
            orgLogoPath: orgData.org_logo_path,
            emailApprovalLink:approvalLink,
          },
        });
      }
      return;
    }

    if (taskId) {
      try {
        newTaskId = await workflowService.completeTask(taskId, action, remarks || "", userName, userRoles);
      } catch (wfErr: any) {
        // For Approve: surface the error — don't silently mark the contract as Approved
        if (action === "Approve") {
          return res.status(400).json({ error: `Workflow error: ${wfErr.message}` });
        }
        console.warn("[process-approval] Workflow completeTask warning:", wfErr.message);
      }
    }

    // ── 6. Determine new contract status ────────────────────────────────────────
    let newStatus: string;
    let newApprStatus: string | null;
    let newApproversList = contract.approvers_list as string | null;
    const isFinalApproval = action === "Approve" && !newTaskId;

    if (action === "Approve") {
      if (newTaskId) {
        // Intermediate step — next approver still pending
        newStatus = "Pending Approval";
        newApprStatus = contract.appr_status ?? null;
      } else {
        // Last approval step — contract fully approved
        newStatus = "Approved";
        newApprStatus = "Approved";
      }
    } else if (action === "Reject") {
      newStatus     = "Rejected";
      newApprStatus = "Rejected";
    } else {
      // More Info Required — task routed back to initiator by completeTask
      newStatus     = "More Info Required";
      newApprStatus = "More Info Required";
    }

    // ── 6b. Remove acting approver from approvers_list (intermediate Approve only) ──
    // Mirrors procurement.service.ts lines 611–623: strip the approver's display name
    // so the pending-approvers section of the timeline doesn't show them twice.
    if (action === "Approve" && newTaskId && newApproversList && actingUser.name) {
      const name = actingUser.name as string;
      if (newApproversList.includes(",")) {
        newApproversList = newApproversList
          .replace(`${name}, `, "")
          .replace(`, ${name}`, "")
          .trim();
      } else {
        newApproversList = "";
      }
    }

    // ── 7. Persist changes to cm_header ─────────────────────────────────────────
    if (isFinalApproval) {
      // Save org-signer details (mirrors Java's setOrgSignerId/Name/Email + setOrgSignDate)
      await tenantPool.query(`
        UPDATE dbo.cm_header SET
          status                = $2,
          appr_status           = $3,
          curr_appr_comments    = $4,
          approvers_list        = $5,
          attribute_12          = NULL,
          last_modified_by      = $6,
          last_modified_date    = NOW(),
          org_signer_id         = $7,
          org_signer_name       = $8,
          org_signer_email      = $9,
          org_signer_designation = $10,
          org_sign_date         = NOW()
        WHERE id = $1
      `, [
        id, newStatus, newApprStatus, remarks || null, newApproversList,
        userName,
        String(actingUser.id), actingUser.name, actingUser.email_id,
        actingUser.designation || null,
      ]);
    } else {
      await tenantPool.query(`
        UPDATE dbo.cm_header SET
          status             = $2,
          appr_status        = $3,
          curr_appr_comments = $4,
          approvers_list     = $5,
          attribute_12       = $6,
          last_modified_by   = $7,
          last_modified_date = NOW()
        WHERE id = $1
      `, [
        id, newStatus, newApprStatus, remarks || null,
        newApproversList, newTaskId || null, userName,
      ]);
    }

    // ── 8. Insert approval-history row (mirrors Java's SuppRegstrApprDtl save) ──
    const { rows: maxIdRow } = await tenantPool.query(
      `SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM dbo.supp_regstr_appr_dtls`
    );
    await tenantPool.query(`
      INSERT INTO dbo.supp_regstr_appr_dtls
        (object_id, supplier_id, approver_id, approver_name,
         attribute_9, attribute_10, status, comments,
         requested_date, approved_date, attribute_1)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)
      `, [
      String(id),                       // object_id = contract id
      0,                                // supplier_id (0 for internal approvals)
      actingUser.id,
      actingUser.name,
      actingUser.email_id,              // attribute_9 = email
      actingUser.designation || null,   // attribute_10 = designation
      action,                           // status = "Approve" | "Reject" | "More"
      remarks || null,
      taskCreationDate,                 // requested_date = when task was originally created
      "CONTRACT",                       // attribute_1 = module tag
    ]);

    if (newTaskId) {
      const { publishTaskAssignmentEvent } = await import("../../services/eventBus/publishTaskAssignment");
      const approverEmail = await getPool().query(`select current_assignee from dbo.wf_step_instance where task_id=${newTaskId}`);
            const appUrl = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
            const apiKey = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);
            const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(String(apiKey.rows[0].prop_value))}&&module=${encodeURIComponent('contract')}&&taskId=${encodeURIComponent(newTaskId)}&&email=${encodeURIComponent(String(approverEmail.rows[0].current_assignee))}&&refnumber=${encodeURIComponent(id)}`;
      publishTaskAssignmentEvent({
        taskId: newTaskId,
        templateEventId: "CONTRACT_APPROVAL",
        taskSub: `Contract approval — ${contract.title || id}`,
        submittedBy: actingUser.name || userName,
        department: "",
        srmsRefNo: String(id),
        variables: {
        orgLogoPath: orgData.org_logo_path,
      },
      });
    }

    res.json({ id, status: newStatus, newTaskId: newTaskId || null });
    audit(req, id, "UPDATE",
      `Contract ${newStatus} (${action}) by ${userName}${remarks ? `. Remarks: ${remarks}` : ""}`
    );

    // Notify contract owner on final decisions (non-blocking)
    const notifyOwner = isFinalApproval || action === "Reject" || action === "More";
    if (notifyOwner) {
      (async () => {
        try {
          const { emailService } = await import("../../services/emailService");
          const { rows: ownerRows } = await tenantPool.query(
            `SELECT h.title, u.email_id, u.name
             FROM dbo.cm_header h
             LEFT JOIN dbo.um_user_dtls u ON u.user_name = h.created_by OR u.email_id = h.created_by
             WHERE h.id = $1 LIMIT 1`,
            [id]
          );
          const ownerEmail = ownerRows[0]?.email_id?.trim();
          if (ownerEmail) {
            const eventId = isFinalApproval ? "PUBLISH_CONTRACT_APPROVED"
                          : action === "Reject" ? "PUBLISH_CONTRACT_REJECT"
                          : "PUBLISH_CONTRACT_MOREINFO";
            await emailService.sendTemplatedEmail(
              eventId,
              ownerEmail,
              {
                owner: ownerRows[0]?.name || ownerEmail,
                taskTitle: ownerRows[0]?.title || String(id),
                submittedBy: actingUser.name || userName,
                contractId: String(id),
                comments: remarks || "",
                status: newStatus,
              }
            );
          }
        } catch (e) {
          console.error("[contracts] Failed to send approval decision notification:", e);
        }
      })();
    }
  } catch (error) {
    handleError(res, error, "Failed to process contract approval");
  }
});

// ── Active workflow task lookup (for Approve button visibility) ─────────────────
router.get("/api/contracts/:id/active-task", async (req, res) => {
  try {
    const { workflowService } = await import("../../services/workflowService");
    const task = await workflowService.findActiveTaskByRefNumber(req.params.id);
    res.json(task || null);
  } catch (error: any) {
    handleError(res, error, "Failed to find active task");
  }
});

// ── Approval History ───────────────────────────────────────────────────────────
// object_id in supp_regstr_appr_dtls stores the contract's numeric id as a string
// (mirrors Java: appHst.setObjectId(contractRefNo) where contractRefNo = cm_header.id)
router.get("/api/contracts/:id/approval-history", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;
    const { rows } = await tenantPool.query(
      `SELECT id, object_id, approver_id, approver_name,
              attribute_9  AS email,
              attribute_10 AS designation,
              status, comments, approved_date, requested_date, attribute_1, attribute_2
       FROM dbo.supp_regstr_appr_dtls
       WHERE object_id = $1 AND attribute_1 = 'CONTRACT'
       ORDER BY id ASC`,
      [String(id)]
    );
    res.json(rows);
  } catch (error) {
    handleError(res, error, "Failed to fetch approval history");
  }
});

// ── Submit For Approval (Accepted → Pending Approval, owner only) ───────────────
router.patch("/api/contracts/:id/submit-for-approval", async (req, res) => {
  try {
    const tenantPool = getPool();
    const user = (req as any).user;
    const { id } = req.params;

    // 1. Fetch contract header
    const { rows: hdrRows } = await tenantPool.query(
      `SELECT id, status, created_by, title, contr_ref_no,
              contract_amount, department_name, org_name, appr_status, curr_appr_comments
       FROM dbo.cm_header WHERE id = $1`, [id]
    );
    if (!hdrRows.length) return res.status(404).json({ error: "Contract not found" });
    const contract = hdrRows[0];
    if (contract.status !== "Accepted") {
      return res.status(400).json({ error: "Contract must be in Accepted status to submit for approval" });
    }

    // 2. Verify owner
    const userName = user?.email || user?.name || user?.userName || "system";
    if (contract.created_by !== userName) {
      return res.status(403).json({ error: "Only the contract owner can submit for approval" });
    }
    const orgData = await adminRepo.getOrgDetails();
    // 3. Fetch logged-in user details for workflow params
    const { rows: userRows } = await tenantPool.query(
      `SELECT u.id, u.name, u.department_name,
              COALESCE(u.attribute_13, o.organization_name, '') AS org_name
       FROM dbo.um_user_dtls u
       LEFT JOIN dbo.um_org_dtls o ON o.id = u.org_id
       WHERE u.user_name = $1 OR u.email_id = $1
       LIMIT 1`, [userName]
    );
    const userDetails = userRows[0] || {};

    // 4. Build workflow params (mirrors Java logic)
    const { workflowService } = await import("../../services/workflowService");
    const processName = "Contract";
    const refLabel = contract.contr_ref_no || String(contract.id);
    let taskSubject = `Contract Approval Request - ${refLabel} - ${contract.title || ""}`;
    if (taskSubject.length > 200) taskSubject = taskSubject.substring(0, 200);

    const params: Record<string, any> = {
      subject: taskSubject,
      srmsRefNumber: String(contract.id),
      status: "Pending Approval",
      startDate: new Date().getTime(),
      createdBy: userDetails.name || userName,
      organization: userDetails.org_name || contract.org_name || "",
      department: userDetails.department_name || contract.department_name || "",
      amount: contract.contract_amount != null ? String(contract.contract_amount) : "0",
    };

    // 5. Check approvers are defined (mirror Java: return error if not)
    const checkApprList = await workflowService.getFirstStepApproversList(processName, params);
    if (!checkApprList || checkApprList.length === 0) {
      return res.status(400).json({
        error: "Approver Hierarchy or Approval Flow is not defined for this request!"
      });
    }

    // 6. Start workflow process
    const taskId = await workflowService.startProcess(taskSubject, processName, String(contract.id), params, userName);

    // 7. Get full approvers list
    const approversList = await workflowService.getApproversList(processName, params);
    const approversStr = approversList.join(", ");

    // 8. Clear appr_status/comments if re-submitting after rejection or more-info
    const newApprStatus = (contract.appr_status === "Rejected" || contract.appr_status === "More Info Required")
      ? null : contract.appr_status;
    const newApprComments = (contract.appr_status === "Rejected" || contract.appr_status === "More Info Required")
      ? null : contract.curr_appr_comments;

    // 9. Update contract header
    const { rows: updated } = await tenantPool.query(`
      UPDATE dbo.cm_header SET
        status           = 'Pending Approval',
        rev_flag         = 'N',
        attribute_12     = $2,
        approvers_list   = $3,
        appr_status      = $4,
        curr_appr_comments = $5,
        last_modified_by = $6,
        last_modified_date = NOW()
      WHERE id = $1
      RETURNING id, status
    `, [id, taskId, approversStr, newApprStatus, newApprComments, userName]);

    res.json({ ...updated[0], taskId, approvers: approversList });
    audit(req, id, "UPDATE", `Contract submitted for approval by ${userName}. Approvers: ${approversStr}`);

    // Notify first approver via task assignment event (non-blocking)
    (async () => {
      try 
      {
            const approverEmail = await getPool().query(`select current_assignee from dbo.wf_step_instance where task_id=${taskId}`);
            const appUrl = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
            const apiKey = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);
            const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(String(apiKey.rows[0].prop_value))}&&module=${encodeURIComponent('contract')}&&taskId=${encodeURIComponent(taskId)}&&email=${encodeURIComponent(String(approverEmail.rows[0].current_assignee))}&&refnumber=${encodeURIComponent(id)}`;
        const { publishTaskAssignmentEvent } = await import("../../services/eventBus/publishTaskAssignment");
        publishTaskAssignmentEvent({
          taskId,
          templateEventId: "CONTRACT_APPROVAL",
          taskSub: taskSubject,
          submittedBy: userDetails.name || userName,
          department: userDetails.department_name || contract.department_name || "",
          srmsRefNo: String(contract.id),
          variables: {
            orgLogoPath: orgData.org_logo_path,
            emailApprovalLink:approvalLink,
          },
        });

        // Notify each approver via CONTRACT_SUBMITTED_FOR_APPROVAL
        for (const approver of approversList) {
          const { rows: apprRows } = await tenantPool.query(
            `SELECT email_id, name FROM dbo.um_user_dtls WHERE user_name = $1 OR email_id = $1 OR name = $1 LIMIT 1`,
            [approver.trim()]
          );
          const apprEmail = apprRows[0]?.email_id?.trim();
          if (apprEmail) {
            eventBus.publish({
              eventType: EventTypes.CONTRACT_SUBMITTED_FOR_APPROVAL,
              contractId: String(contract.id),
              contractTitle: contract.title || "",
              contractRefNo: contract.contr_ref_no || String(contract.id),
              requestorName: userDetails.name || userName,
              approverName: apprRows[0]?.name || approver,
              receiverEmail: apprEmail,
              timestamp: new Date(),
              orgLogoPath: orgData.org_logo_path,
            });
          }
        }
      } catch (e) {
        console.error("[contracts] Failed to send submit-for-approval notification:", e);
      }
    })();
  } catch (error: any) {
    // Surface workflow errors (e.g. no approver defined) as 400 instead of 500
    if (error?.message?.includes("No assignees") || error?.message?.includes("not found")) {
      return res.status(400).json({ error: error.message });
    }
    handleError(res, error, "Failed to submit contract for approval");
  }
});

// ── Send for Signing ─────────────────────────────────────────────────────────────
router.patch("/api/contracts/:id/send-for-signing", async (req, res) => {
  try {
    const tenantPool = getPool();
    const user = (req as any).user;
    const { id } = req.params;

    const { rows } = await tenantPool.query(
      `SELECT id, status, created_by, title FROM dbo.cm_header WHERE id = $1`, [id]
    );
    if (!rows.length) return res.status(404).json({ error: "Contract not found" });
    const contract = rows[0];

    if (contract.status !== "Approved") {
      return res.status(400).json({ error: "Only Approved contracts can be sent for signing" });
    }

    const userName = user?.email || user?.name || user?.userName || "system";
    if (contract.created_by !== userName) {
      return res.status(403).json({ error: "Only the contract owner can send for signing" });
    }

    const { rows: updated } = await tenantPool.query(
      `UPDATE dbo.cm_header
       SET status = 'Approved', last_modified_by = $2, last_modified_date = NOW()
       WHERE id = $1
       RETURNING *`, [id, userName]
    );

    res.json(updated[0]);
    audit(req, id, "UPDATE", `Contract sent for signing by ${userName}. Status changed to Approved.`);
  } catch (error) {
    handleError(res, error, "Failed to send contract for signing");
  }
});

// ── Sign Contract ────────────────────────────────────────────────────────────────
router.patch("/api/contracts/:id/sign", async (req, res) => {
  try {
    const tenantPool = getPool();
    const user = (req as any).user;
    const { id } = req.params;
    const { party, signatureData } = req.body; // party: 'first' | 'second'

    if (!party || !["first", "second"].includes(party)) {
      return res.status(400).json({ error: "party must be 'first' or 'second'" });
    }

    const { rows } = await tenantPool.query(
      `SELECT id, status, org_sign_date, supp_sign_date, org_signer_email FROM dbo.cm_header WHERE id = $1`, [id]
    );
    if (!rows.length) return res.status(404).json({ error: "Contract not found" });
    const contract = rows[0];

    if (contract.status !== "Approved") {
      return res.status(400).json({ error: "Contract is not in Approved status" });
    }

    const userName = user?.userName || user?.name || user?.email || "system";
    const callerEmail = (user?.email || "").toLowerCase().trim();
    const callerUserName = (user?.userName || "").toLowerCase().trim();
    const callerSupplierId = user?.supplierId || "";

    // Authorization (Option B):
    // Second party → any registered vendor portal user for this vendor (supplierId match) may sign.
    // Auth signatory contacts are for display only, not for access control.
    // First party → the designated org signer (set at Send-for-Signing / Approval time).
    if (party === "second") {
      const { rows: vendorRows } = await tenantPool.query(
        `SELECT supplier_id FROM dbo.cm_supplier_dtls WHERE contractrefno = $1 LIMIT 1`, [id]
      );
      const vendorSupplierId = vendorRows[0]?.supplier_id || null;
      if (vendorSupplierId) {
        if (!callerSupplierId || String(callerSupplierId) !== String(vendorSupplierId)) {
          return res.status(403).json({ error: "Only a registered vendor portal user for this vendor may sign this contract" });
        }
      }
    } else if (party === "first") {
      const orgSignerEmail = (contract.org_signer_email || "").toLowerCase().trim();
      if (orgSignerEmail && callerEmail !== orgSignerEmail && callerUserName !== orgSignerEmail) {
        return res.status(403).json({ error: "Only the designated organization signatory may sign this contract" });
      }
    }
    const { rows: userRows } = await tenantPool.query(
      `SELECT name, email_id, designation FROM dbo.um_user_dtls
       WHERE user_name = $1 OR email_id = $1 LIMIT 1`, [userName]
    );
    const userDetail = userRows[0] || {};
    const signerName = userDetail.name || userName;
    const signerEmail = userDetail.email_id || userName;
    const signerDesig = userDetail.designation || "";

    if (party === "first") {
      await tenantPool.query(
        `UPDATE dbo.cm_header
         SET org_signer_name = $2, org_signer_email = $3, org_signer_designation = $4,
             org_signer_id = $5, org_sign_date = NOW(), org_sign_data = $6,
             last_modified_by = $5, last_modified_date = NOW()
         WHERE id = $1`,
        [id, signerName, signerEmail, signerDesig, userName, signatureData || null]
      );
    } else {
      await tenantPool.query(
        `UPDATE dbo.cm_header
         SET supp_signer_name = $2, supp_signer_email = $3, supp_signer_designation = $4,
             supp_signer_id = $5, supp_sign_date = NOW(), supp_sign_data = $6,
             last_modified_by = $5, last_modified_date = NOW()
         WHERE id = $1`,
        [id, signerName, signerEmail, signerDesig, userName, signatureData || null]
      );
    }

    // Check if both parties have now signed → set Signed
    const { rows: refreshed } = await tenantPool.query(
      `SELECT org_sign_date, supp_sign_date FROM dbo.cm_header WHERE id = $1`, [id]
    );
    const bothSigned = refreshed[0]?.org_sign_date && refreshed[0]?.supp_sign_date;

    let finalStatus = "Approved";
    if (bothSigned) {
      await tenantPool.query(
        `UPDATE dbo.cm_header SET status = 'Signed', last_modified_by = $2, last_modified_date = NOW() WHERE id = $1`,
        [id, userName]
      );
      finalStatus = "Signed";
    }

    const { rows: result } = await tenantPool.query(`SELECT * FROM dbo.cm_header WHERE id = $1`, [id]);
    res.json({ ...result[0], fullyExecuted: !!bothSigned });
    audit(req, id, "UPDATE", `Contract ${party === "first" ? "First Party" : "Second Party"} signed by ${signerName}. Status: ${finalStatus}.`);
  } catch (error) {
    handleError(res, error, "Failed to sign contract");
  }
});

// ── Activate Contract (Signed → Active) ──────────────────────────────────────────
router.patch("/api/contracts/:id/activate", async (req, res) => {
  try {
    const tenantPool = getPool();
    const user = (req as any).user;
    const { id } = req.params;

    const { rows } = await tenantPool.query(
      `SELECT id, status, created_by, title FROM dbo.cm_header WHERE id = $1`, [id]
    );
    if (!rows.length) return res.status(404).json({ error: "Contract not found" });
    const contract = rows[0];

    if (contract.status !== "Signed") {
      return res.status(400).json({ error: "Only Signed contracts can be activated" });
    }

    const userName = user?.email || user?.name || user?.userName || "system";
    if (contract.created_by !== userName) {
      return res.status(403).json({ error: "Only the contract owner can activate the contract" });
    }

    const { rows: updated } = await tenantPool.query(
      `UPDATE dbo.cm_header
       SET status = 'Active', last_modified_by = $2, last_modified_date = NOW()
       WHERE id = $1
       RETURNING *`, [id, userName]
    );

    res.json(updated[0]);
    audit(req, id, "UPDATE", `Contract activated by ${userName}. Status changed from Signed to Active.`);
  } catch (error) {
    handleError(res, error, "Failed to activate contract");
  }
});

// ── Terminate Contract (Active → Terminated) ─────────────────────────────────────
router.patch("/api/contracts/:id/terminate", async (req, res) => {
  try {
    const tenantPool = getPool();
    const user = (req as any).user;
    const { id } = req.params;

    const { rows } = await tenantPool.query(
      `SELECT id, status, created_by, title FROM dbo.cm_header WHERE id = $1`, [id]
    );
    if (!rows.length) return res.status(404).json({ error: "Contract not found" });
    const contract = rows[0];

    if (contract.status !== "Active") {
      return res.status(400).json({ error: "Only Active contracts can be terminated" });
    }

    const userName = user?.email || user?.name || user?.userName || "system";
    if (contract.created_by !== userName) {
      return res.status(403).json({ error: "Only the contract owner can terminate the contract" });
    }

    const { rows: updated } = await tenantPool.query(
      `UPDATE dbo.cm_header
       SET status = 'Terminated', last_modified_by = $2, last_modified_date = NOW()
       WHERE id = $1
       RETURNING *`, [id, userName]
    );

    res.json(updated[0]);
    audit(req, id, "UPDATE", `Contract terminated by ${userName}. Status changed from Active to Terminated.`);
  } catch (error) {
    handleError(res, error, "Failed to terminate contract");
  }
});

// ── Contract Performance ─────────────────────────────────────────────────────────
router.get("/api/contracts/performance/:refNo", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { refNo } = req.params;

    const { rows: contracts } = await tenantPool.query(
      `SELECT id, title, status, contr_ref_no, contract_amount, currency,
              start_date, end_date, supplier_name, department_name, owner_name, type, owner,
              is_renewable
       FROM dbo.cm_header WHERE contr_ref_no = $1 OR id::text = $1`, [refNo]
    );
    if (!contracts.length) return res.status(404).json({ error: "Contract not found" });
    const contract = contracts[0];
    const contractId = contract.id;

    const [posRes, invoicesRes, paymentTermsRes, deliveryRes, sowRes, poLinesRes] = await Promise.all([
      tenantPool.query(
        `SELECT po_number, po_status, po_total_cost, invoiced_amount, creation_date, po_description
         FROM dbo.supp_po_header_dtls WHERE contract_ref_no = $1 ORDER BY creation_date DESC`, [refNo]
      ),
      tenantPool.query(
        `SELECT invoice_number, invoice_status, invoice_amount, invoice_amount_paid,
                invoice_date, supplier_name, inv_payment_status, creation_date
         FROM dbo.supp_invoice_dtls WHERE contr_ref_no = $1 ORDER BY creation_date DESC`, [refNo]
      ),
      tenantPool.query(
        `SELECT id, name, payment_type, period, amt_milestone, pcnt_milestone
         FROM dbo.cm_payment_terms WHERE parent_id = $1 ORDER BY id`, [contractId]
      ),
      tenantPool.query(
        `SELECT id, deliverable_name, details, schedule_date, tentative_date,
                schedule_frequency, schedule_type, amt_milestone, pcnt_milestone
         FROM dbo.cm_delivery_schedules WHERE parent_id = $1 ORDER BY COALESCE(schedule_date, tentative_date)`, [contractId]
      ),
      tenantPool.query(
        `SELECT id, item_name, description, start_date, deliverydate, quantity, unit_cost,
                total_cost, uom, type, del_status, received_qty
         FROM dbo.cm_sow WHERE parent_id = $1 ORDER BY id`, [contractId]
      ),
      tenantPool.query(
        `SELECT l.item_name, l.line_unit_cost, l.line_qty, l.line_cost, l.po_number, l.line_description
         FROM dbo.supp_po_line_dtls l
         WHERE l.po_number IN (
           SELECT po_number FROM dbo.supp_po_header_dtls WHERE contract_ref_no = $1
         )
         ORDER BY l.po_number`, [refNo]
      ),
    ]);

    const pos = posRes.rows;
    const invoices = invoicesRes.rows;
    const paymentTerms = paymentTermsRes.rows;
    const deliverySchedules = deliveryRes.rows;
    const sow = sowRes.rows;
    const poLines = poLinesRes.rows;

    const contractValue = parseFloat(contract.contract_amount) || 0;
    const totalPoValue = pos.reduce((sum: number, p: any) => sum + (parseFloat(p.po_total_cost) || 0), 0);
    const totalInvoiced = invoices.reduce((sum: number, i: any) => sum + (parseFloat(i.invoice_amount) || 0), 0);
    const totalPaid = invoices.reduce((sum: number, i: any) => sum + (parseFloat(i.invoice_amount_paid) || 0), 0);
    const utilizationPct = contractValue > 0 ? Math.min(100, Math.round((totalInvoiced / contractValue) * 100)) : 0;

    // ── Savings Realization ───────────────────────────────────────────────────
    const contractedSowValue = sow.reduce((sum: number, s: any) => sum + (parseFloat(s.total_cost) || 0), 0);
    const savingsValue = contractedSowValue > 0 ? contractedSowValue - totalPoValue : contractValue - totalPoValue;
    const savingsPct = contractedSowValue > 0
      ? Math.round((savingsValue / contractedSowValue) * 100)
      : contractValue > 0 ? Math.round((savingsValue / contractValue) * 100) : 0;

    // ── Rate Compliance ───────────────────────────────────────────────────────
    const sowRateMap: Record<string, number> = {};
    sow.forEach((s: any) => {
      if (s.item_name && s.unit_cost) sowRateMap[s.item_name.toLowerCase().trim()] = parseFloat(s.unit_cost) || 0;
    });
    const rateViolations: Array<{ item_name: string; contracted_rate: number; actual_rate: number; variance_pct: number; po_number: string }> = [];
    poLines.forEach((l: any) => {
      const key = (l.item_name || "").toLowerCase().trim();
      const contractedRate = sowRateMap[key];
      const actualRate = parseFloat(l.line_unit_cost) || 0;
      if (contractedRate && actualRate && actualRate > contractedRate * 1.05) {
        rateViolations.push({
          item_name: l.item_name,
          contracted_rate: contractedRate,
          actual_rate: actualRate,
          variance_pct: Math.round(((actualRate - contractedRate) / contractedRate) * 100),
          po_number: l.po_number,
        });
      }
    });

    // ── Risk Calculation ─────────────────────────────────────────────────────
    const today = new Date();
    const startDate = contract.start_date ? new Date(contract.start_date) : null;
    const endDate = contract.end_date ? new Date(contract.end_date) : null;
    const daysTotal = startDate && endDate ? Math.round((endDate.getTime() - startDate.getTime()) / 86400000) : 0;
    const daysElapsed = startDate ? Math.max(0, Math.round((today.getTime() - startDate.getTime()) / 86400000)) : 0;
    const daysRemaining = endDate ? Math.max(0, Math.round((endDate.getTime() - today.getTime()) / 86400000)) : null;
    const timeElapsedPct = daysTotal > 0 ? Math.min(100, Math.round((daysElapsed / daysTotal) * 100)) : 0;
    const spendPct = contractValue > 0 ? Math.min(100, Math.round((totalInvoiced / contractValue) * 100)) : 0;
    const spendPaceDelta = timeElapsedPct - spendPct;
    const overdueInvoices = invoices.filter((i: any) => i.inv_payment_status && !["paid", "completed"].includes(i.inv_payment_status.toLowerCase())).length;
    const poCoveragePct = contractValue > 0 ? Math.min(100, Math.round((totalPoValue / contractValue) * 100)) : 0;
    const isRenewable = (contract.is_renewable || "").toLowerCase() === "yes";
    const inRenewalWindow = isRenewable && daysRemaining !== null && daysRemaining <= 90;

    let riskLevel = "Low";
    const riskFlags: string[] = [];
    if (daysRemaining !== null && daysRemaining < 30) { riskLevel = "High"; riskFlags.push("Contract expires in less than 30 days"); }
    else if (daysRemaining !== null && daysRemaining < 90) { if (riskLevel !== "High") riskLevel = "Medium"; riskFlags.push("Contract expires in less than 90 days"); }
    if (inRenewalWindow) { if (riskLevel !== "High") riskLevel = "Medium"; riskFlags.push("Renewable contract — renewal decision needed soon"); }
    if (spendPaceDelta > 40) { if (riskLevel !== "High") riskLevel = "Medium"; riskFlags.push("Spend significantly behind schedule"); }
    if (overdueInvoices > 0) { if (riskLevel !== "High") riskLevel = "Medium"; riskFlags.push(`${overdueInvoices} invoice${overdueInvoices > 1 ? "s" : ""} with pending payment`); }
    if (contractValue > 0 && totalPoValue === 0 && timeElapsedPct > 20) { if (riskLevel !== "High") riskLevel = "Medium"; riskFlags.push("No purchase orders raised yet"); }
    if (rateViolations.length > 0) { if (riskLevel !== "High") riskLevel = "Medium"; riskFlags.push(`${rateViolations.length} PO line item${rateViolations.length > 1 ? "s" : ""} priced above contracted rate`); }

    res.json({
      contract,
      pos,
      invoices,
      paymentTerms,
      deliverySchedules,
      sow,
      summary: { contractValue, totalPoValue, totalInvoiced, totalPaid, utilizationPct },
      savings: { contractedSowValue, savingsValue, savingsPct },
      rateCompliance: { violations: rateViolations, totalPoLines: poLines.length },
      risk: {
        level: riskLevel,
        flags: riskFlags,
        daysTotal,
        daysElapsed,
        daysRemaining,
        timeElapsedPct,
        spendPct,
        spendPaceDelta,
        overdueInvoices,
        poCoveragePct,
        isRenewable,
        inRenewalWindow,
      },
    });
  } catch (error) {
    handleError(res, error, "Failed to fetch contract performance");
  }
});

// ── AI Obligation Extraction ──────────────────────────────────────────────────
router.post("/api/contracts/performance/:refNo/extract-obligations", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { refNo } = req.params;

    const { rows: contracts } = await tenantPool.query(
      `SELECT id, title, contr_ref_no FROM dbo.cm_header WHERE contr_ref_no = $1 OR id::text = $1`, [refNo]
    );
    if (!contracts.length) return res.status(404).json({ error: "Contract not found" });
    const contractId = contracts[0].id;

    const { rows: terms } = await tenantPool.query(
      `SELECT terms_name, row_name, term_details, description FROM dbo.cm_contracts_terms
       WHERE contractrefno = $1 AND (term_details IS NOT NULL OR description IS NOT NULL)
       ORDER BY order_by, id`, [contractId]
    );

    if (!terms.length) {
      return res.json({ obligations: [], message: "No contract terms found to analyze" });
    }

    const { getAIClient, getAIModelName } = await import("../../services/ai-client");
    let aiClient: any;
    try { aiClient = await getAIClient(); } catch { /* not configured */ }
    if (!aiClient) return res.status(503).json({ error: "AI_NOT_CONFIGURED", message: "No AI provider configured" });

    const modelName = await getAIModelName().catch(() => "gpt-4o-mini");

    const stripHtml = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const clauseText = terms.map((t: any) => {
      const name = t.terms_name || t.row_name || "Clause";
      const text = stripHtml(t.term_details || t.description || "");
      return `[${name}]\n${text}`;
    }).join("\n\n");

    const prompt = `You are a contract analyst. Extract all concrete obligations, commitments, deadlines, and key dates from these contract clauses.

Return a JSON object with an "obligations" array. Each obligation must have:
- "type": one of "Payment", "Delivery", "SLA", "Renewal", "Notice", "Compliance", "Reporting", "Other"
- "party": "Buyer", "Vendor", or "Both"
- "description": clear 1-sentence obligation statement
- "dueDate": ISO date string if mentioned, or null
- "priority": "High", "Medium", or "Low"

Contract clauses:
${clauseText.substring(0, 8000)}`;

    const response = await aiClient.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 2000,
      temperature: 0.2,
    });

    const raw = response.choices[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { obligations: [] }; }
    const obligations = Array.isArray(parsed) ? parsed : (parsed.obligations || []);

    res.json({ obligations, clausesAnalyzed: terms.length });
  } catch (error) {
    handleError(res, error, "Failed to extract obligations");
  }
});

// ── AI Contract Analysis — Risk Score + Plain-English Summary ────────────────
router.post("/api/contracts/:id/ai-analysis", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;

    const { rows: contracts } = await tenantPool.query(
      `SELECT h.id, h.title, h.status, h.contract_amount, h.currency,
              h.start_date, h.end_date, h.type, h.is_renewable,
              (SELECT s.supplier_name FROM dbo.cm_supplier_dtls s WHERE s.contractrefno = h.id LIMIT 1) AS vendor_name
       FROM dbo.cm_header h
       WHERE h.id::text = $1 OR h.contr_ref_no = $1`, [id]
    );
    if (!contracts.length) return res.status(404).json({ error: "Contract not found" });
    const contract = contracts[0];

    const [termsResult, sowResult] = await Promise.all([
      tenantPool.query(
        `SELECT terms_name, row_name, term_details, description
         FROM dbo.cm_contracts_terms
         WHERE contractrefno = $1 AND (term_details IS NOT NULL OR description IS NOT NULL)
         ORDER BY order_by, id`, [contract.id]
      ),
      tenantPool.query(
        `SELECT description, type, quantity, uom, unit_cost, total_cost,
                deliverydate, payment_terms, period_type, item_name, specifications
         FROM dbo.cm_sow WHERE parent_id = $1`, [contract.id]
      ).catch(() => ({ rows: [] })),
    ]);
    const terms = termsResult.rows;
    const sowItems = sowResult.rows;

    const { getAIClient, getAIModelName } = await import("../../services/ai-client");
    let aiClient: any;
    try { aiClient = await getAIClient(); } catch { /* not configured */ }
    if (!aiClient) return res.status(503).json({ error: "AI_NOT_CONFIGURED", message: "No AI provider configured" });

    const modelName = await getAIModelName().catch(() => "gpt-4o-mini");
    const stripHtml = (html: string) => (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

    const clauseText = terms.map((t: any) => {
      const name = t.terms_name || t.row_name || "Clause";
      const text = stripHtml(t.term_details || t.description || "");
      return `[${name}]\n${text}`;
    }).join("\n\n");

    const sowText = sowItems.length > 0
      ? sowItems.map((s: any) => {
          const parts = [
            s.item_name || s.description ? `Item: ${s.item_name || s.description}` : null,
            s.type ? `Type: ${s.type}` : null,
            s.quantity ? `Qty: ${s.quantity} ${s.uom || ""}`.trim() : null,
            s.unit_cost ? `Unit Cost: ${s.unit_cost}` : null,
            s.total_cost ? `Total: ${s.total_cost}` : null,
            s.deliverydate ? `Delivery: ${s.deliverydate}` : null,
            s.payment_terms ? `Payment: ${s.payment_terms}` : null,
            s.specifications ? `Specs: ${s.specifications}` : null,
          ].filter(Boolean);
          return parts.join(" | ");
        }).join("\n")
      : null;

    const contractDurationDays = contract.start_date && contract.end_date
      ? Math.round((new Date(contract.end_date).getTime() - new Date(contract.start_date).getTime()) / 86400000)
      : null;

    const meta = [
      `Title: ${contract.title}`,
      contract.type ? `Type: ${contract.type}` : null,
      contract.vendor_name ? `Vendor/Supplier: ${contract.vendor_name}` : null,
      contract.contract_amount ? `Total Value: ${contract.currency || ""} ${contract.contract_amount}` : null,
      contract.start_date ? `Start Date: ${new Date(contract.start_date).toDateString()}` : null,
      contract.end_date ? `End Date: ${new Date(contract.end_date).toDateString()}` : null,
      contractDurationDays ? `Duration: ${contractDurationDays} days` : null,
      contract.is_renewable ? `Auto-Renewable: ${contract.is_renewable}` : null,
    ].filter(Boolean).join("\n");

    const clauseSection = clauseText.length > 0
      ? `\n\nCONTRACT CLAUSES (${terms.length} clauses):\n${clauseText.substring(0, 9000)}`
      : "\n\nNo contract clauses available — analyze based on contract metadata only.";

    const sowSection = sowText
      ? `\n\nSTATEMENT OF WORK (${sowItems.length} line items):\n${sowText.substring(0, 2000)}`
      : "";

    const prompt = `You are a senior contract risk analyst and legal expert. Perform a comprehensive risk analysis of this contract and return a JSON object with the following exact structure:

{
  "summary": "2-3 sentence plain-English summary covering: what the contract is for, who the parties are, the key commercial terms (value, duration, deliverables), and the primary obligation for each side",
  "riskScore": <integer 1-10 where 1=very low risk, 10=very high risk>,
  "riskLevel": "<Low|Medium|High>",
  "risks": {
    "financial": { "score": <1-10>, "notes": "Assess: contract value exposure, payment terms, penalty clauses, price escalation provisions, currency risk, late payment consequences, and liability caps vs. unlimited liability" },
    "compliance": { "score": <1-10>, "notes": "Assess: regulatory obligations, data protection/confidentiality requirements, IP ownership and licensing, indemnification exposure, governing law and jurisdiction, dispute resolution mechanism (arbitration vs. litigation)" },
    "delivery": { "score": <1-10>, "notes": "Assess: milestone clarity, SLA commitments and penalties, force majeure coverage, termination notice periods, exit provisions and lock-in, auto-renewal traps, change management process" }
  },
  "keyPoints": [
    "Specific key point with actual values/dates from the contract",
    "Payment structure or terms",
    "Termination and exit rights",
    "Liability and indemnification position",
    "Key obligations for each party",
    "Any exclusivity, IP, or confidentiality obligation"
  ],
  "redFlags": ["Critical concern 1", "Critical concern 2"],
  "signatoryNote": "1-2 sentences specifically calling out the single most important thing the signing authority must verify or negotiate before executing this contract"
}

Scoring guidelines:
- riskLevel: Low = score 1-3, Medium = 4-6, High = 7-10
- riskScore = weighted average of the three sub-scores (financial 40%, compliance 30%, delivery 30%), rounded to nearest integer
- keyPoints: 4-6 specific bullet points — always include amounts, dates, and party obligations where present
- redFlags: 0-4 items only — only genuine red flags like unlimited liability, no termination clause, missing SLAs, auto-renewal with no notice, one-sided indemnification, unclear IP ownership, or missing dispute resolution. Return empty array [] if none.
- If clauses are sparse, flag missing protections (e.g. no termination clause = higher delivery risk)
- Be specific — mention actual clause names, values, and dates from the contract

CONTRACT METADATA:
${meta}${sowSection}${clauseSection}`;

    const response = await aiClient.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 2000,
      temperature: 0.2,
    });

    const raw = response.choices[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }

    res.json({
      summary: parsed.summary || "Unable to generate summary.",
      riskScore: parsed.riskScore ?? 5,
      riskLevel: parsed.riskLevel || "Medium",
      risks: parsed.risks || {
        financial: { score: 5, notes: "Unable to assess." },
        compliance: { score: 5, notes: "Unable to assess." },
        delivery: { score: 5, notes: "Unable to assess." },
      },
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
      signatoryNote: parsed.signatoryNote || null,
      clausesAnalyzed: terms.length,
      sowItemsAnalyzed: sowItems.length,
    });
  } catch (error) {
    handleError(res, error, "Failed to generate AI contract analysis");
  }
});

// ── Helper: insert a review-action row into approval history ────────────────────
async function insertReviewHistory(tenantPool: any, contractId: string, user: any, action: string, comments: string | null) {
  try {
    await tenantPool.query(`
      INSERT INTO dbo.supp_regstr_appr_dtls
        (object_id, supplier_id, approver_id, approver_name,
         attribute_9, attribute_10, status, comments,
         requested_date, approved_date, attribute_1, attribute_2)
      VALUES ($1, 0, $2, $3, $4, $5, $6, $7, NOW(), NOW(), 'CONTRACT', 'REVIEW')`,
      [
        String(contractId),
        user?.id || 0,
        user?.name || user?.email || "Unknown",
        user?.email || null,
        user?.designation || null,
        action,
        comments || null,
      ]
    );
  } catch (e) {
    console.error("Failed to insert review history:", e);
  }
}

// ── Accept Review  (also handles "MoreInfoRequired" type) ───────────────────────
router.patch("/api/contracts/:id/accept-review", async (req, res) => {
  try {
    const tenantPool = getPool();
    const user = (req as any).user;
    const { id } = req.params;
    const { type, comments } = req.body;
    const isMoreInfo = type && type.toLowerCase() === "moreinforequired";
    const modifiedBy = user?.email || user?.name || "system";
    const orgData = await adminRepo.getOrgDetails();

    // 1. Fetch contract header
    const { rows: hdrRows } = await tenantPool.query(
      `SELECT id, status, appr_process_id FROM dbo.cm_header WHERE id = $1`, [id]
    );
    if (!hdrRows.length) return res.status(404).json({ error: "Contract not found" });
    const hdr = hdrRows[0];

    // ── Branch A: More Info Required ─────────────────────────────────────────
    if (isMoreInfo) {
      // Mark ALL Review Team approvers with 'M' (More Info)
      await tenantPool.query(
        `UPDATE dbo.cm_approvers SET accepted_contract = 'M'
         WHERE contractrefno = $1 AND LOWER(teamtype) = 'review team'`,
        [id]
      );
      // Update header status + save comments if provided
      const { rows: updated } = await tenantPool.query(`
        UPDATE dbo.cm_header SET
          status            = 'More Info Required',
          curr_appr_comments = COALESCE($2, curr_appr_comments),
          last_modified_by  = $3,
          last_modified_date = NOW()
        WHERE id = $1
        RETURNING id, status
      `, [id, comments || null, modifiedBy]);
      res.json(updated[0]);
      audit(req, id, "UPDATE", `Contract review – more info required. Requested by ${modifiedBy}`);
      await insertReviewHistory(tenantPool, id, user, "More Info Required", comments || null);

      // Notify requestor/owner
      (async () => {
        try {
          const { rows: fullHdr } = await tenantPool.query(
            `SELECT h.title, h.contr_ref_no, h.owner, h.owner_name,
                    u.email_id AS owner_email, u.name AS owner_display_name
             FROM dbo.cm_header h
             LEFT JOIN dbo.um_user_dtls u ON u.user_name = h.owner OR u.email_id = h.owner
             WHERE h.id = $1 LIMIT 1`, [id]
          );
          const c = fullHdr[0];
          if (c?.owner_email) {
            eventBus.publish({
              eventType: EventTypes.REVIEWER_REQUESTED_MORE_INFO,
              contractId: String(id),
              contractTitle: c.title || "",
              contractRefNo: c.contr_ref_no || String(id),
              reviewerName: modifiedBy,
              requestorName: c.owner_display_name || c.owner_name || c.owner || "",
              receiverEmail: c.owner_email,
              comments: comments || "",
              timestamp: new Date(),
              orgLogoPath: orgData.org_logo_path,
            });
          }
        } catch (e) {
          console.error("[contracts] Failed to send REVIEWER_REQUESTED_MORE_INFO event:", e);
        }
      })();

      return;
    }

    // ── Branch B: Normal Accept ───────────────────────────────────────────────
    // 2. Load all Review Team approvers sorted by insertion order (id ASC)
    const { rows: apprs } = await tenantPool.query(`
      SELECT ca.id, ca.user_id, ca.accepted_contract,
             u.user_name, u.name, u.id AS u_id
      FROM dbo.cm_approvers ca
      LEFT JOIN dbo.um_user_dtls u ON u.id::text = ca.user_id::text
      WHERE ca.contractrefno = $1 AND LOWER(ca.teamtype) = 'review team'
      ORDER BY ca.id ASC
    `, [id]);

    // 3. Find this user's approver entry — match by user_id
    const myAppr = apprs.find((a: any) => String(a.user_id) === String(user?.id || ""));
    if (!myAppr) {
      return res.status(403).json({ error: "You are not assigned as a reviewer for this contract" });
    }

    // 4. Mark current reviewer as accepted
    await tenantPool.query(
      `UPDATE dbo.cm_approvers SET accepted_contract = 'Y', rejected_contract = 'N' WHERE id = $1`,
      [myAppr.id]
    );

    // 5. Re-fetch all approvers and check if EVERY Review Team member has accepted
    //    All reviewers work in parallel — no sequential advancement of appr_process_id
    const { rows: freshApprs } = await tenantPool.query(`
      SELECT accepted_contract FROM dbo.cm_approvers
      WHERE contractrefno = $1 AND LOWER(teamtype) = 'review team'
    `, [id]);

    const allAccepted = freshApprs.every(
      (a: any) => a.accepted_contract === "Y"
    );

    const newStatus      = allAccepted ? "Review Completed" : hdr.status;
    const newApprProcess = allAccepted ? null : hdr.appr_process_id;

    const { rows: updated } = await tenantPool.query(`
      UPDATE dbo.cm_header SET
        status             = $2,
        appr_process_id    = $3,
        last_modified_by   = $4,
        last_modified_date = NOW()
      WHERE id = $1
      RETURNING id, status
    `, [id, newStatus, newApprProcess, modifiedBy]);

    res.json(updated[0]);
    audit(req, id, "UPDATE", `Contract review accepted by ${modifiedBy}. Status: ${newStatus}`);
    await insertReviewHistory(tenantPool, id, user, "Accepted", null);

    // Notify requestor/owner
    (async () => {
      try {
        const { rows: fullHdr } = await tenantPool.query(
          `SELECT h.title, h.contr_ref_no, h.owner, h.owner_name,
                  u.email_id AS owner_email, u.name AS owner_display_name
           FROM dbo.cm_header h
           LEFT JOIN dbo.um_user_dtls u ON u.user_name = h.owner OR u.email_id = h.owner
           WHERE h.id = $1 LIMIT 1`, [id]
        );
        const c = fullHdr[0];
        if (c?.owner_email) {
          eventBus.publish({
            eventType: EventTypes.CONTRACT_REVIEW_ACCEPTED,
            contractId: String(id),
            contractTitle: c.title || "",
            contractRefNo: c.contr_ref_no || String(id),
            reviewerName: modifiedBy,
            requestorName: c.owner_display_name || c.owner_name || c.owner || "",
            receiverEmail: c.owner_email,
            timestamp: new Date(),
            orgLogoPath: orgData.org_logo_path,
          });
        }
      } catch (e) {
        console.error("[contracts] Failed to send CONTRACT_REVIEW_ACCEPTED event:", e);
      }
    })();
  } catch (error) {
    handleError(res, error, "Failed to accept review");
  }
});

// ── Reject Review ────────────────────────────────────────────────────────────────
router.patch("/api/contracts/:id/reject-review", async (req, res) => {
  try {
    const tenantPool = getPool();
    const user = (req as any).user;
    const { id } = req.params;
    const { comments } = req.body;

    // 1. Verify contract exists
    const { rows: hdrRows } = await tenantPool.query(
      `SELECT id, status FROM dbo.cm_header WHERE id = $1`, [id]
    );
    if (!hdrRows.length) return res.status(404).json({ error: "Contract not found" });
    const allowedStatuses = ["Pending Approval", "Under Review", "More Info Required"];
    if (!allowedStatuses.includes(hdrRows[0].status)) {
      return res.status(400).json({ error: "Contract is not currently under review" });
    }
    const orgData = await adminRepo.getOrgDetails();

    // 2. Find this user's reviewer record in the Review Team
    const { rows: myAppr } = await tenantPool.query(`
      SELECT ca.id FROM dbo.cm_approvers ca
      WHERE ca.contractrefno = $1 AND LOWER(ca.teamtype) = 'review team'
        AND ca.user_id::text = $2::text AND ca.review_required = 'Y'
    `, [id, String(user?.id || "")]);
    if (!myAppr.length) {
      return res.status(403).json({ error: "You are not assigned as a reviewer for this contract" });
    }

    const modifiedBy = user?.userName || user?.email || "system";
    const reviewComments = comments?.trim() || null;

    // 3. Update contract header: status → "Review Rejected", save review_comments (Java: setStatus + setReviewComments)
    const { rows: updated } = await tenantPool.query(`
      UPDATE dbo.cm_header SET
        status = 'Review Rejected',
        review_comments = $2,
        curr_appr_comments = $2,
        last_modified_by = $3,
        last_modified_date = NOW()
      WHERE id = $1
      RETURNING id, status
    `, [id, reviewComments, modifiedBy]);

    // 4. Mark this reviewer's record as rejected (Java: appr.setRejectedContract("Y"))
    await tenantPool.query(
      `UPDATE dbo.cm_approvers SET rejected_contract = 'Y', accepted_contract = 'N' WHERE id = $1`,
      [myAppr[0].id]
    );

    res.json(updated[0]);
    audit(req, id, "UPDATE", `Contract review is rejected with comments:${reviewComments || ""}`);
    await insertReviewHistory(tenantPool, id, user, "Rejected", reviewComments);

    // Notify requestor/owner
    (async () => {
      try {
        const { rows: fullHdr } = await tenantPool.query(
          `SELECT h.title, h.contr_ref_no, h.owner, h.owner_name,
                  u.email_id AS owner_email, u.name AS owner_display_name
           FROM dbo.cm_header h
           LEFT JOIN dbo.um_user_dtls u ON u.user_name = h.owner OR u.email_id = h.owner
           WHERE h.id = $1 LIMIT 1`, [id]
        );
        const c = fullHdr[0];
        if (c?.owner_email) {
          eventBus.publish({
            eventType: EventTypes.CONTRACT_REVIEW_REJECTED,
            contractId: String(id),
            contractTitle: c.title || "",
            contractRefNo: c.contr_ref_no || String(id),
            reviewerName: modifiedBy,
            requestorName: c.owner_display_name || c.owner_name || c.owner || "",
            receiverEmail: c.owner_email,
            comments: reviewComments || "",
            timestamp: new Date(),
            orgLogoPath: orgData.org_logo_path,
          });
        }
      } catch (e) {
        console.error("[contracts] Failed to send CONTRACT_REVIEW_REJECTED event:", e);
      }
    })();
  } catch (error) {
    handleError(res, error, "Failed to reject review");
  }
});

// ── Vendor Details ─────────────────────────────────────────────────────────────
router.get("/api/contracts/:id/vendor", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { rows } = await tenantPool.query(
      `SELECT id, supplier_id, supplier_name, supplier_contact, supplier_contact_no, supplier_contact_email, supplier_site
       FROM dbo.cm_supplier_dtls WHERE contractrefno = $1 LIMIT 1`,
      [req.params.id]
    );
    res.json(rows[0] || null);
  } catch (error) { handleError(res, error, "Failed to fetch vendor"); }
});

router.post("/api/contracts/:id/vendor", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;
    const { supplier_id, supplier_name, supplier_contact_email: fallbackEmail, supplier_contact_no: fallbackPhone } = req.body;
    const user = (req as any).user?.email || "system";

    // Look up primary contact from supp_contact_dtls
    const { rows: contacts } = await tenantPool.query(
      `SELECT contact_name, email, phone, mobile FROM dbo.supp_contact_dtls
       WHERE supplier_id = $1 AND LOWER(is_primary) IN ('yes','true','1') LIMIT 1`,
      [supplier_id]
    );
    const primary = contacts[0];
    const supplier_contact = primary?.contact_name || null;
    const supplier_contact_email = primary?.email || fallbackEmail || null;
    const supplier_contact_no = primary?.phone || primary?.mobile || fallbackPhone || null;

    await tenantPool.query(`DELETE FROM dbo.cm_supplier_dtls WHERE contractrefno = $1`, [id]);
    const newId = Math.floor(Math.random() * 900000000) + 100000000;
    const { rows } = await tenantPool.query(`
      INSERT INTO dbo.cm_supplier_dtls (id, contractrefno, supplier_id, supplier_name, supplier_contact, supplier_contact_no, supplier_contact_email, created_by, creation_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING id, supplier_id, supplier_name, supplier_contact, supplier_contact_no, supplier_contact_email`,
      [newId, id, supplier_id, supplier_name, supplier_contact, supplier_contact_no, supplier_contact_email, user]
    );
    res.json(rows[0]);
    audit(req, id, "UPDATE", `Supplier assigned to contract: ${supplier_name}`);
  } catch (error) { handleError(res, error, "Failed to save vendor"); }
});

router.delete("/api/contracts/:id/vendor", async (req, res) => {
  try {
    const tenantPool = getPool();
    await tenantPool.query(`DELETE FROM dbo.cm_supplier_dtls WHERE contractrefno = $1`, [req.params.id]);
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", `Supplier removed from contract`);
  } catch (error) { handleError(res, error, "Failed to remove vendor"); }
});

// ── Vendor: Submit Negotiation ───────────────────────────────────────────────────
router.patch("/api/contracts/:id/vendor-submit-negotiation", async (req, res) => {
  try {
    const tenantPool = getPool();
    const user = (req as any).user;
    const { id } = req.params;
    const modifiedBy = user?.email || user?.name || "system";

    const { rows: hdrRows } = await tenantPool.query(
      `SELECT id, status FROM dbo.cm_header WHERE id = $1`, [id]
    );
    if (!hdrRows.length) return res.status(404).json({ error: "Contract not found" });
    if (hdrRows[0].status !== "Under Negotiation") {
      return res.status(400).json({ error: "Contract is not in Under Negotiation status" });
    }

    const { rows: updated } = await tenantPool.query(`
      UPDATE dbo.cm_header SET
        status = 'Supplier Submit For Negotiation',
        rev_flag = 'N',
        last_modified_by = $2,
        last_modified_date = NOW()
      WHERE id = $1
      RETURNING id, status
    `, [id, modifiedBy]);

    res.json(updated[0]);
    audit(req, id, "UPDATE", `Supplier submitted negotiation for contract ${id}`);

    // Notify contract owner (non-blocking)
    (async () => {
      try {
        const { emailService } = await import("../../services/emailService");
        const { rows: ownerRows } = await tenantPool.query(
          `SELECT h.title, h.contr_ref_no, u.email_id, u.name
           FROM dbo.cm_header h
           LEFT JOIN dbo.um_user_dtls u ON u.user_name = h.created_by OR u.email_id = h.created_by
           WHERE h.id = $1 LIMIT 1`,
          [id]
        );
        const ownerEmail = ownerRows[0]?.email_id?.trim();
        if (ownerEmail) {
          await emailService.sendTemplatedEmail(
            "CONTRACT_NEGOTIATION_SUPPLIER",
            ownerEmail,
            {
              supplierName: ownerRows[0]?.name || ownerEmail,
              taskTitle: ownerRows[0]?.title || String(id),
              submittedBy: modifiedBy,
              contractId: ownerRows[0]?.contr_ref_no || String(id),
            }
          );
        }
      } catch (e) {
        console.error("[contracts] Failed to send vendor negotiation notification:", e);
      }
    })();
  } catch (error) { handleError(res, error, "Failed to submit negotiation"); }
});

// ── Owner: Submit Negotiation (routes to Review Team; they must approve before it reaches the vendor) ──
router.patch("/api/contracts/:id/owner-submit-negotiation", async (req, res) => {
  try {
    const tenantPool = getPool();
    const user = (req as any).user;
    const { id } = req.params;
    const modifiedBy = user?.email || user?.name || "system";

    const { rows: hdrRows } = await tenantPool.query(
      `SELECT id, status FROM dbo.cm_header WHERE id = $1`, [id]
    );
    if (!hdrRows.length) return res.status(404).json({ error: "Contract not found" });
    if (hdrRows[0].status !== "Supplier Submit For Negotiation") {
      return res.status(400).json({ error: "Contract is not in Supplier Submit For Negotiation status" });
    }

    // Reset Review Team approvers so they can re-review the creator's negotiation response
    const { rows: reviewers } = await tenantPool.query(`
      SELECT ca.id, ca.user_id, u.user_name, u.name, u.email_id
      FROM dbo.cm_approvers ca
      LEFT JOIN dbo.um_user_dtls u ON u.id::text = ca.user_id::text
      WHERE ca.contractrefno = $1 AND LOWER(ca.teamtype) = 'review team'
      ORDER BY ca.id ASC
    `, [id]);

    if (!reviewers.length) {
      return res.status(400).json({
        error: "Please add at least one Review Team member before submitting negotiation changes for review"
      });
    }

    for (const reviewer of reviewers) {
      await tenantPool.query(
        `UPDATE dbo.cm_approvers SET review_required = 'Y', accepted_contract = 'N', rejected_contract = 'N' WHERE id = $1`,
        [reviewer.id]
      );
    }

    const { rows: updated } = await tenantPool.query(`
      UPDATE dbo.cm_header SET
        status = 'Negotiation Under Review',
        last_modified_by = $2,
        last_modified_date = NOW()
      WHERE id = $1
      RETURNING id, status
    `, [id, modifiedBy]);

    res.json(updated[0]);
    audit(req, id, "UPDATE", `Owner submitted negotiation response for review team approval on contract ${id}`);
    await insertReviewHistory(tenantPool, id, user, "Negotiation ReSubmit", "");

    // Notify each review team member by email (non-blocking)
    (async () => {
      try {
        const { emailService } = await import("../../services/emailService");
        for (const reviewer of reviewers) {
          const email = reviewer.email_id?.trim();
          if (!email) continue;
          await emailService.sendTemplatedEmail(
            "PUBLISH_CONTRACT_REVIEW",
            email,
            {
              name: reviewer.name || reviewer.user_name || email,
              taskTitle: `Negotiation Review Request - ${id}`,
              submittedBy: modifiedBy,
              contractId: String(id),
            }
          );
        }
      } catch (e) {
        console.error("[contracts] Failed to send negotiation review notification:", e);
      }
    })();
  } catch (error) { handleError(res, error, "Failed to submit negotiation"); }
});

// ── Review Team: Accept Negotiation Review (all must accept before it reaches the vendor) ──
router.patch("/api/contracts/:id/negotiation-accept-review", async (req, res) => {
  try {
    const tenantPool = getPool();
    const user = (req as any).user;
    const { id } = req.params;
    const modifiedBy = user?.email || user?.name || "system";

    const { rows: hdrRows } = await tenantPool.query(
      `SELECT id, status, title, contr_ref_no FROM dbo.cm_header WHERE id = $1`, [id]
    );
    if (!hdrRows.length) return res.status(404).json({ error: "Contract not found" });
    const hdr = hdrRows[0];
    if (hdr.status !== "Negotiation Under Review") {
      return res.status(400).json({ error: "Contract is not in Negotiation Under Review status" });
    }

    // Find this user's Review Team entry
    const { rows: apprs } = await tenantPool.query(`
      SELECT ca.id, ca.user_id, ca.accepted_contract
      FROM dbo.cm_approvers ca
      WHERE ca.contractrefno = $1 AND LOWER(ca.teamtype) = 'review team'
      ORDER BY ca.id ASC
    `, [id]);
    const myAppr = apprs.find((a: any) => String(a.user_id) === String(user?.id || ""));
    if (!myAppr) {
      return res.status(403).json({ error: "You are not assigned as a reviewer for this contract" });
    }

    await tenantPool.query(
      `UPDATE dbo.cm_approvers SET accepted_contract = 'Y', rejected_contract = 'N' WHERE id = $1`,
      [myAppr.id]
    );

    // Every Review Team member must accept before the contract goes back to the vendor
    const { rows: freshApprs } = await tenantPool.query(`
      SELECT accepted_contract FROM dbo.cm_approvers
      WHERE contractrefno = $1 AND LOWER(teamtype) = 'review team'
    `, [id]);
    const allAccepted = freshApprs.every((a: any) => a.accepted_contract === "Y");
    const newStatus = allAccepted ? "Under Negotiation" : hdr.status;

    const { rows: updated } = await tenantPool.query(`
      UPDATE dbo.cm_header SET
        status = $2,
        rev_flag = 'N',
        last_modified_by = $3,
        last_modified_date = NOW()
      WHERE id = $1
      RETURNING id, status
    `, [id, newStatus, modifiedBy]);

    res.json(updated[0]);
    audit(req, id, "UPDATE", `Negotiation review accepted by ${modifiedBy}. Status: ${newStatus}`);
    await insertReviewHistory(tenantPool, id, user, "Negotiation Review Accepted", null);

    if (allAccepted) {
      // Notify the vendor that their negotiation response is ready (non-blocking)
      (async () => {
        try {
          const { emailService } = await import("../../services/emailService");
          const { rows: suppliers } = await tenantPool.query(
            `SELECT supplier_name, supplier_contact_email FROM dbo.cm_supplier_dtls WHERE contractrefno = $1 LIMIT 1`, [id]
          );
          const supplierEmail = suppliers[0]?.supplier_contact_email?.trim();
          if (supplierEmail) {
            await emailService.sendTemplatedEmail(
              "CONTRACT_NEGOTIATION_SUPPLIER",
              supplierEmail,
              {
                supplierName: suppliers[0]?.supplier_name || supplierEmail,
                taskTitle: hdr.title || String(id),
                submittedBy: modifiedBy,
                contractId: hdr.contr_ref_no || String(id),
              }
            );
          }
        } catch (e) {
          console.error("[contracts] Failed to send negotiation-review-approved notification:", e);
        }
      })();
    }
  } catch (error) { handleError(res, error, "Failed to accept negotiation review"); }
});

// ── Review Team: Reject Negotiation Review (sends back to creator for edits) ──
router.patch("/api/contracts/:id/negotiation-reject-review", async (req, res) => {
  try {
    const tenantPool = getPool();
    const user = (req as any).user;
    const { id } = req.params;
    const { comments } = req.body;

    const { rows: hdrRows } = await tenantPool.query(
      `SELECT id, status FROM dbo.cm_header WHERE id = $1`, [id]
    );
    if (!hdrRows.length) return res.status(404).json({ error: "Contract not found" });
    if (hdrRows[0].status !== "Negotiation Under Review") {
      return res.status(400).json({ error: "Contract is not in Negotiation Under Review status" });
    }
    const orgData = await adminRepo.getOrgDetails();

    // Find this user's reviewer record in the Review Team
    const { rows: myAppr } = await tenantPool.query(`
      SELECT ca.id FROM dbo.cm_approvers ca
      WHERE ca.contractrefno = $1 AND LOWER(ca.teamtype) = 'review team'
        AND ca.user_id::text = $2::text AND ca.review_required = 'Y'
    `, [id, String(user?.id || "")]);
    if (!myAppr.length) {
      return res.status(403).json({ error: "You are not assigned as a reviewer for this contract" });
    }

    const modifiedBy = user?.email || user?.name || "system";
    const reviewComments = comments?.trim() || null;

    // Back to the creator (same status the vendor's original negotiation lands in) so they can revise and resubmit
    const { rows: updated } = await tenantPool.query(`
      UPDATE dbo.cm_header SET
        status = 'Supplier Submit For Negotiation',
        review_comments = $2,
        curr_appr_comments = $2,
        last_modified_by = $3,
        last_modified_date = NOW()
      WHERE id = $1
      RETURNING id, status
    `, [id, reviewComments, modifiedBy]);

    await tenantPool.query(
      `UPDATE dbo.cm_approvers SET rejected_contract = 'Y', accepted_contract = 'N' WHERE id = $1`,
      [myAppr[0].id]
    );

    res.json(updated[0]);
    audit(req, id, "UPDATE", `Negotiation review is rejected with comments:${reviewComments || ""}`);
    await insertReviewHistory(tenantPool, id, user, "Negotiation Review Rejected", reviewComments);

    // Notify contract owner/creator (non-blocking)
    (async () => {
      try {
        const { rows: fullHdr } = await tenantPool.query(
          `SELECT h.title, h.contr_ref_no, h.owner, h.owner_name,
                  u.email_id AS owner_email, u.name AS owner_display_name
           FROM dbo.cm_header h
           LEFT JOIN dbo.um_user_dtls u ON u.user_name = h.owner OR u.email_id = h.owner
           WHERE h.id = $1 LIMIT 1`, [id]
        );
        const c = fullHdr[0];
        if (c?.owner_email) {
          eventBus.publish({
            eventType: EventTypes.CONTRACT_REVIEW_REJECTED,
            contractId: String(id),
            contractTitle: c.title || "",
            contractRefNo: c.contr_ref_no || String(id),
            reviewerName: modifiedBy,
            requestorName: c.owner_display_name || c.owner_name || c.owner || "",
            receiverEmail: c.owner_email,
            comments: reviewComments || "",
            timestamp: new Date(),
            orgLogoPath: orgData.org_logo_path,
          });
        }
      } catch (e) {
        console.error("[contracts] Failed to send negotiation review rejected notification:", e);
      }
    })();
  } catch (error) { handleError(res, error, "Failed to reject negotiation review"); }
});

// ── Vendor: Submit Acceptance ────────────────────────────────────────────────────
router.patch("/api/contracts/:id/vendor-submit-acceptance", async (req, res) => {
  try {
    const tenantPool = getPool();
    const user = (req as any).user;
    const { id } = req.params;
    const modifiedBy = user?.email || user?.name || "system";
    const orgData = await adminRepo.getOrgDetails();

    const { rows: hdrRows } = await tenantPool.query(
      `SELECT id, status FROM dbo.cm_header WHERE id = $1`, [id]
    );
    if (!hdrRows.length) return res.status(404).json({ error: "Contract not found" });
    if (hdrRows[0].status !== "Under Negotiation") {
      return res.status(400).json({ error: "Contract is not in Under Negotiation status" });
    }

    const { rows: updated } = await tenantPool.query(`
      UPDATE dbo.cm_header SET
        status = 'Accepted',
        rev_flag = 'N',
        last_modified_by = $2,
        last_modified_date = NOW()
      WHERE id = $1
      RETURNING id, status
    `, [id, modifiedBy]);

    res.json(updated[0]);
    audit(req, id, "UPDATE", `Supplier accepted contract ${id}`);

    // Notify requestor/owner
    (async () => {
      try {
        const { rows: fullHdr } = await tenantPool.query(
          `SELECT h.title, h.contr_ref_no, h.owner, h.owner_name,
                  u.email_id AS owner_email, u.name AS owner_display_name
           FROM dbo.cm_header h
           LEFT JOIN dbo.um_user_dtls u ON u.user_name = h.owner OR u.email_id = h.owner
           WHERE h.id = $1 LIMIT 1`, [id]
        );
        const { rows: vendorRows } = await tenantPool.query(
          `SELECT supplier_name FROM dbo.cm_supplier_dtls WHERE contractrefno = $1 LIMIT 1`, [id]
        );
        const c = fullHdr[0];
        const vendorName = vendorRows[0]?.supplier_name || modifiedBy;
        if (c?.owner_email) {
          eventBus.publish({
            eventType: EventTypes.VENDOR_CLAUSE_ACCEPTED,
            contractId: String(id),
            contractTitle: c.title || "",
            contractRefNo: c.contr_ref_no || String(id),
            vendorName: vendorName,
            requestorName: c.owner_display_name || c.owner_name || c.owner || "",
            receiverEmail: c.owner_email,
            timestamp: new Date(),
            orgLogoPath: orgData.org_logo_path,
          });
        }
      } catch (e) {
        console.error("[contracts] Failed to send VENDOR_CLAUSE_ACCEPTED event:", e);
      }
    })();
  } catch (error) { handleError(res, error, "Failed to submit acceptance"); }
});

// ── Review Team ─────────────────────────────────────────────────────────────────
router.get("/api/contracts/:id/reviewers", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { rows } = await tenantPool.query(`
      SELECT a.id, a.user_id, u.name AS user_name, u.email_id AS user_email,
             a.accepted_contract, a.rejected_contract, a.review_required, a.level
      FROM dbo.cm_approvers a
      JOIN dbo.um_user_dtls u ON u.id = a.user_id
      WHERE a.contractrefno = $1 AND a.teamtype = 'Review Team'`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error) { handleError(res, error, "Failed to fetch reviewers"); }
});

router.post("/api/contracts/:id/reviewers", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;
    const { user_id } = req.body;
    const existing = await tenantPool.query(
      `SELECT id FROM dbo.cm_approvers WHERE contractrefno = $1 AND user_id = $2 AND teamtype = 'Review Team'`,
      [id, user_id]
    );
    if (existing.rows.length) return res.status(409).json({ error: "Member already in review team" });
    const levelResult = await tenantPool.query(
      `SELECT COALESCE(MAX(level), 0) AS max_level
       FROM dbo.cm_approvers
       WHERE contractrefno = $1
         AND teamtype = 'Review Team'`,
      [id]
    );
    const nextLevel = Number(levelResult.rows[0].max_level) + 1;
    const newId = Math.floor(Math.random() * 900000000) + 100000000;
    await tenantPool.query(
      `INSERT INTO dbo.cm_approvers (id, contractrefno, user_id, teamtype, level) VALUES ($1, $2, $3, 'Review Team', $4)`,
      [newId, id, user_id, nextLevel]
    );
    const { rows } = await tenantPool.query(
      `SELECT a.id, a.user_id, u.name AS user_name, u.email_id AS user_email
       FROM dbo.cm_approvers a JOIN dbo.um_user_dtls u ON u.id = a.user_id WHERE a.id = $1`,
      [newId]
    );
    res.json(rows[0]);
    audit(req, id, "UPDATE", `Reviewer added to contract: user_id ${user_id}`);
  } catch (error) { handleError(res, error, "Failed to add reviewer"); }
});

router.delete("/api/contracts/:id/reviewers/:reviewerId", async (req, res) => {
  try {
    const tenantPool = getPool();
    const deletedLevel = await tenantPool.query(
      `SELECT level
       FROM dbo.cm_approvers
       WHERE id = $1
         AND teamtype = 'Review Team'`,
      [req.params.reviewerId]
    );
    await tenantPool.query(
      `DELETE FROM dbo.cm_approvers WHERE id = $1 AND contractrefno = $2`,
      [req.params.reviewerId, req.params.id]
    );
    await tenantPool.query(
      `UPDATE dbo.cm_approvers
       SET level = level - 1
       WHERE contractrefno = $1
         AND teamtype = 'Review Team'
         AND level > $2`,
      [req.params.id, parseInt(deletedLevel.rows[0]?.level)]
    );
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", `Reviewer removed from contract`);
  } catch (error) { handleError(res, error, "Failed to remove reviewer"); }
});

// ── Scope of Work (cm_sow) ─────────────────────────────────────────────────────
router.get("/api/contracts/:id/sow", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { rows } = await tenantPool.query(
      `SELECT * FROM dbo.cm_sow WHERE parent_id = $1 AND (del_status IS NULL OR del_status != 'Y') ORDER BY id`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error) { handleError(res, error, "Failed to fetch SOW lines"); }
});

router.post("/api/contracts/:id/sow", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;
    const { description, quantity, uom, unit_cost, start_date, deliverydate, specifications, linetype, categoryCode, categoryName, itemId, itemName } = req.body;
    const newId = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 9999);
    const totalCost = (parseFloat(quantity || "0") || 0) * (parseFloat(unit_cost) || 0);
    const { rows } = await tenantPool.query(
      `INSERT INTO dbo.cm_sow (id, parent_id, description, quantity, uom, unit_cost, total_cost, start_date, deliverydate, specifications, type, item_id, item_name, category_code, category_name, del_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'N') RETURNING *`,
      [newId, id, description, quantity || null, uom || null, unit_cost || null, totalCost || null,
       start_date || null, deliverydate || null, specifications || null,
       linetype || null, itemId || null, itemName || null, categoryCode || null, categoryName || null]
    );
    res.json(rows[0]);
    audit(req, id, "CREATE", `SOW line added to contract: ${id}`);
  } catch (error) { handleError(res, error, "Failed to create SOW line"); }
});

router.put("/api/contracts/:id/sow/:sowId", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id, sowId } = req.params;
    const { description, quantity, uom, unit_cost, start_date, deliverydate, specifications, linetype, categoryCode, categoryName, itemId, itemName } = req.body;
    const totalCost = (parseFloat(quantity || "0") || 0) * (parseFloat(unit_cost) || 0);
    const { rows } = await tenantPool.query(
      `UPDATE dbo.cm_sow SET description=$1, quantity=$2, uom=$3, unit_cost=$4, total_cost=$5,
       start_date=$6, deliverydate=$7, specifications=$8, type=$9, item_id=$10, item_name=$11, category_code=$12, category_name=$13
       WHERE id=$14 AND parent_id=$15 RETURNING *`,
      [description, quantity || null, uom || null, unit_cost || null, totalCost || null,
       start_date || null, deliverydate || null, specifications || null,
       linetype || null, itemId || null, itemName || null, categoryCode || null, categoryName || null,
       sowId, id]
    );
    if (!rows.length) return res.status(404).json({ error: "SOW line not found" });
    res.json(rows[0]);
    audit(req, id, "UPDATE", `SOW line updated: ${sowId}`);
  } catch (error) { handleError(res, error, "Failed to update SOW line"); }
});

router.delete("/api/contracts/:id/sow/:sowId", async (req, res) => {
  try {
    const tenantPool = getPool();
    await tenantPool.query(
      `UPDATE dbo.cm_sow SET del_status = 'Y' WHERE id = $1 AND parent_id = $2`,
      [req.params.sowId, req.params.id]
    );
    res.json({ success: true });
    audit(req, req.params.id, "DELETE", `SOW line removed: ${req.params.sowId}`);
  } catch (error) { handleError(res, error, "Failed to delete SOW line"); }
});

// ── Clause Library (cm_sections) ───────────────────────────────────────────────
router.get("/api/contracts/clause-library", async (req, res) => {
  try {
    const tenantPool = getPool();
    const search = (req.query.search as string) || "";
    const { rows } = await tenantPool.query(
      `SELECT section_id, section_name, description, html_content, section_type,
              clause_mandatory, clause_ammendable, clause_negotiable, orderby, template_id
       FROM dbo.cm_sections
       WHERE template_id = 0
         AND ($1 = '' OR LOWER(section_name) LIKE $2 OR LOWER(description) LIKE $2)
       ORDER BY section_name`,
      [search, `%${search.toLowerCase()}%`]
    );
    res.json(rows);
  } catch (error) { handleError(res, error, "Failed to fetch clause library"); }
});

// ── Contract Clauses (cm_contracts_terms) ──────────────────────────────────────
router.get("/api/contracts/:id/clauses", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { rows } = await tenantPool.query(
      `SELECT * FROM dbo.cm_contracts_terms WHERE contractrefno = $1 ORDER BY COALESCE(order_by, 9999), id`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error) { handleError(res, error, "Failed to fetch clauses"); }
});

router.post("/api/contracts/:id/clauses", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;
    const sessionUser = (req as any).user;
    const { terms_name, term_details, terms_id, mandatory, term_amendable, term_negotiable, order_by } = req.body;
    const newId = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 9999);
    const { rows } = await tenantPool.query(
      `INSERT INTO dbo.cm_contracts_terms (id, contractrefno, terms_name, term_details, terms_id, mandatory, term_amendable, term_negotiable, order_by, created_by, creation_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), 'Active') RETURNING *`,
      [newId, id, terms_name || "New Clause", term_details || "", terms_id || null,
       mandatory || "No", term_amendable || "Yes", term_negotiable || "Yes",
       order_by || 99, sessionUser?.email || ""]
    );
    res.status(201).json(rows[0]);
    audit(req, id, "CREATE", `Clause added: ${terms_name || "New Clause"}`);
  } catch (error) { handleError(res, error, "Failed to add clause"); }
});

router.put("/api/contracts/:id/clauses/reorder", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { orderedIds } = req.body as { orderedIds: number[] };
    for (let i = 0; i < orderedIds.length; i++) {
      await tenantPool.query(
        `UPDATE dbo.cm_contracts_terms SET order_by = $1 WHERE id = $2 AND contractrefno = $3`,
        [i + 1, orderedIds[i], req.params.id]
      );
    }
    res.json({ success: true });
  } catch (error) { handleError(res, error, "Failed to reorder clauses"); }
});

router.put("/api/contracts/:id/clauses/:clauseId", async (req, res) => {
  try {
    const tenantPool = getPool();
    const sessionUser = (req as any).user;
    const { terms_name, term_details, mandatory, term_amendable, term_negotiable } = req.body;

    // Fetch existing clause + contract status so we can snapshot it before overwriting
    const { rows: existing } = await tenantPool.query(
      `SELECT t.term_details, t.terms_name, h.status
       FROM dbo.cm_contracts_terms t
       JOIN dbo.cm_header h ON h.id = t.contractrefno
       WHERE t.id = $1 AND t.contractrefno = $2`,
      [req.params.clauseId, req.params.id]
    );
    const oldDetails = existing[0]?.term_details ?? null;
    const newDetails = term_details ?? null;
    const contractStatus = (existing[0]?.status ?? "").toLowerCase();

    // Only snapshot history when the contract is NOT in Draft status
    if (contractStatus !== "draft" && newDetails !== null && oldDetails !== null && newDetails !== oldDetails) {
      const { rows: idRow } = await tenantPool.query(
        `SELECT COALESCE(MAX(id), 380700000) + 1 AS next_id FROM dbo.cm_contracts_terms_hst`
      );
      const histId = idRow[0].next_id;
      await tenantPool.query(
        `INSERT INTO dbo.cm_contracts_terms_hst
           (id, action, action_date, action_taken_by, action_taken_by_name, term_details, contr_term_id)
         VALUES ($1, 'Modified', NOW(), $2, $3, $4, $5)`,
        [histId, sessionUser?.email || "", sessionUser?.name || sessionUser?.email || "", oldDetails, req.params.clauseId]
      );
    }

    const { rows } = await tenantPool.query(
      `UPDATE dbo.cm_contracts_terms
       SET terms_name = COALESCE($1, terms_name),
           term_details = COALESCE($2, term_details),
           mandatory = COALESCE($3, mandatory),
           term_amendable = COALESCE($4, term_amendable),
           term_negotiable = COALESCE($5, term_negotiable),
           last_modified_by = $6, last_modified_date = NOW()
       WHERE id = $7 AND contractrefno = $8 RETURNING *`,
      [terms_name, term_details, mandatory, term_amendable, term_negotiable,
       sessionUser?.email || "", req.params.clauseId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Clause not found" });
    res.json(rows[0]);
    audit(req, req.params.id, "UPDATE", `Clause updated: ${terms_name}`);
  } catch (error) { handleError(res, error, "Failed to update clause"); }
});

router.delete("/api/contracts/:id/clauses/:clauseId", async (req, res) => {
  try {
    const tenantPool = getPool();
    const sessionUser = (req as any).user;
    // During negotiation, soft-delete so the vendor can see the 'Deleted' status
    const { rows: contractRows } = await tenantPool.query(
      `SELECT status FROM dbo.cm_header WHERE id = $1`, [req.params.id]
    );
    const contractStatus = contractRows[0]?.status ?? "";
    const isNegotiation = ["Under Negotiation", "Vendor Submit For Negotiation", "Supplier Submit For Negotiation"].includes(contractStatus);
    if (isNegotiation) {
      await tenantPool.query(
        `UPDATE dbo.cm_contracts_terms SET status = 'Deleted', last_modified_by = $1, last_modified_date = NOW()
         WHERE id = $2 AND contractrefno = $3`,
        [sessionUser?.email || "", req.params.clauseId, req.params.id]
      );
      res.status(204).send();
    } else {
      await tenantPool.query(
        `DELETE FROM dbo.cm_contracts_terms WHERE id = $1 AND contractrefno = $2`,
        [req.params.clauseId, req.params.id]
      );
      res.status(204).send();
    }
    audit(req, req.params.id, "DELETE", `Clause removed: ${req.params.clauseId}`);
  } catch (error) { handleError(res, error, "Failed to delete clause"); }
});

router.patch("/api/contracts/:id/clauses/:clauseId/status", async (req, res) => {
  try {
    const tenantPool = getPool();
    const sessionUser = (req as any).user;
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "status is required" });
    const { rows } = await tenantPool.query(
      `UPDATE dbo.cm_contracts_terms SET status = $1, last_modified_by = $2, last_modified_date = NOW()
       WHERE id = $3 AND contractrefno = $4 RETURNING *`,
      [status, sessionUser?.email || "", req.params.clauseId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Clause not found" });
    res.json(rows[0]);
    audit(req, req.params.id, "UPDATE", `Clause status updated to ${status}: ${req.params.clauseId}`);
  } catch (error) { handleError(res, error, "Failed to update clause status"); }
});

// ── Contract Attachments (cm_attachment_dtls) ──────────────────────────────────
router.get("/api/contracts/:id/attachments", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { rows } = await tenantPool.query(
      `SELECT * FROM dbo.cm_attachment_dtls WHERE contractrefno = $1 ORDER BY id DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error) { handleError(res, error, "Failed to fetch attachments"); }
});

router.post("/api/contracts/:id/attachments", upload.single("file"), rewrapTenantContext, async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;
    const sessionUser = (req as any).user;
    const file = req.file;
    let attachPath = "";
    let attachName = req.body.attach_name || "";
    let attachType = req.body.attach_type || "application/octet-stream";

    if (file) {
      const validation = validateUploadedFile(file);
      if (!validation.valid) {
        res.status(400).json({ error: `Invalid file "${file.originalname}": ${validation.error}` });
        return;
      }
      const uploadsDir = path.join(process.cwd(), "uploads", "contracts", String(id));
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const safeName = sanitizeFilename(file.originalname);
      const uniqueName = `${Date.now()}_${safeName}`;
      const filePath = path.join(uploadsDir, uniqueName);
      fs.writeFileSync(filePath, file.buffer);
      attachPath = `uploads/contracts/${id}/${uniqueName}`;
      attachName = file.originalname;
      attachType = file.mimetype;
    }

    const newId = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 9999);
    const { rows } = await tenantPool.query(
      `INSERT INTO dbo.cm_attachment_dtls (id, contractrefno, attach_name, attach_desc, attach_type, attach_path, attach_source, created_by, created_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
      [newId, id, attachName, req.body.attach_desc || "", attachType, attachPath,
       req.body.attach_source || "SOW", sessionUser?.email || ""]
    );
    res.status(201).json(rows[0]);
    audit(req, id, "CREATE", `Attachment added to contract: ${attachName}`);
  } catch (error) { handleError(res, error, "Failed to add attachment"); }
});

router.get("/api/contracts/:id/attachments/:attachId/download", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { rows } = await tenantPool.query(
      `SELECT * FROM dbo.cm_attachment_dtls WHERE id = $1 AND contractrefno = $2`,
      [req.params.attachId, req.params.id]
    );
    if (!rows.length || !rows[0].attach_path) return res.status(404).json({ error: "File not found" });
    const filePath = path.join(process.cwd(), String(rows[0].attach_path));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found on disk" });
    res.setHeader("Content-Disposition", `attachment; filename="${String(rows[0].attach_name)}"`);
    res.setHeader("Content-Type", String(rows[0].attach_type || "application/octet-stream"));
    res.sendFile(filePath);
  } catch (error) { handleError(res, error, "Failed to download attachment"); }
});

router.delete("/api/contracts/:id/attachments/:attachId", async (req, res) => {
  try {
    const tenantPool = getPool();
    await tenantPool.query(`DELETE FROM dbo.cm_attachment_dtls WHERE id = $1 AND contractrefno = $2`, [req.params.attachId, req.params.id]);
    res.status(204).send();
    audit(req, req.params.id, "DELETE", `Attachment removed: ${req.params.attachId}`);
  } catch (error) { handleError(res, error, "Failed to delete attachment"); }
});

// ── Contract PDF Preview (HTML document, browser-printable) ───────────────────
router.get("/api/contracts/:id/preview", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;

    const { rows: contractRows } = await tenantPool.query(
      `SELECT h.id, h.title, h.description, h.status, h.type, h.version, h.contr_ref_no,
              h.org_name, h.owner_name, h.owner, h.department_name,
              h.start_date, h.end_date, h.currency, h.contract_amount,
              h.project_name, h.project_ref_no, h.creation_date, h.created_by,
              h.org_signer_name, h.org_signer_email, h.supp_signer_name,
              h.org_signer_designation, h.supp_signer_designation,
              h.org_sign_date, h.supp_sign_date,
              h.org_sign_data, h.supp_sign_data,
              h.attribute_7, h.subsidary_id,
              h.is_delivery_sched_req, h.is_inspection_sched_req
       FROM dbo.cm_header h WHERE h.id = $1`,
      [id]
    );
    if (!contractRows.length) return res.status(404).send("Contract not found");
    const contract = contractRows[0];

    const { rows: vendorRows } = await tenantPool.query(
      `SELECT supplier_name, supplier_contact, supplier_contact_email,
              supplier_site, attribute_1, attribute_3, supplier_id
       FROM dbo.cm_supplier_dtls WHERE contractrefno = $1 LIMIT 1`,
      [id]
    );
    const vendor = vendorRows[0] || null;

    // Fetch authorized signatories for the vendor from contacts table
    const vendorSupplierId = vendor?.supplier_id || null;
    let authSignatories: any[] = [];
    if (vendorSupplierId) {
      const { rows: authRows } = await tenantPool.query(
        `SELECT contact_name, designation, email, mobile
         FROM dbo.supp_contact_dtls
         WHERE supplier_id = $1 AND is_auth_signatory = 'Yes'
         ORDER BY id ASC`,
        [vendorSupplierId]
      );
      authSignatories = authRows;
    }
    const hasAuthSignatory = authSignatories.length > 0;
    const primaryAuthSignatory = authSignatories[0] || null;
    const authSignatoryName = primaryAuthSignatory?.contact_name || "";
    const authSignatoryDesig = primaryAuthSignatory?.designation || "";
    const authSignatoryEmails = authSignatories.map((a: any) => (a.email || "").toLowerCase().trim());

    // Logged-in user identity — userName is the login credential (most reliable)
    const sessionUser = (req as any).user;
    const loggedInEmail = (sessionUser?.email || "").toLowerCase().trim();
    const loggedInUserName = (sessionUser?.userName || "").toLowerCase().trim();
    const loggedInSupplierId = sessionUser?.supplierId || "";

    // Option B authorization logic:
    // Auth signatory contacts = DISPLAY ONLY (who is shown in the document as the signatory).
    // Authorization to sign = any registered vendor portal user for this vendor (supplierId match).
    // If no auth signatory contact defined, the portal user's own name is used in the document.
    const isCurrentUserVendorPortalUser =
      !!vendorSupplierId && !!loggedInSupplierId &&
      String(loggedInSupplierId) === String(vendorSupplierId);
    const isCurrentUserAuthSignatory = isCurrentUserVendorPortalUser;

    // For display when the portal user is signing but no auth signatory contact is set
    const vendorPortalUserName = !hasAuthSignatory
      ? (sessionUser?.name || loggedInUserName || "Authorized Representative") : "";
    const vendorPortalUserDesig = !hasAuthSignatory
      ? (sessionUser?.designation || "") : "";

    // Org (first party) signer check
    const orgSignerEmail = (contract.org_signer_email || "").toLowerCase().trim();
    const isCurrentUserOrgSigner = !!orgSignerEmail &&
      (loggedInEmail === orgSignerEmail || loggedInUserName === orgSignerEmail);

    const { rows: clauseRows } = await tenantPool.query(
      `SELECT id,
              COALESCE(NULLIF(TRIM(row_name),''), NULLIF(TRIM(terms_name),''), '') AS terms_name,
              term_details, order_by
       FROM dbo.cm_contracts_terms
       WHERE contractrefno = $1 ORDER BY COALESCE(order_by, 9999), id`,
      [id]
    );

    const { rows: commentRows } = await tenantPool.query(
      `SELECT h.attribute_4 AS uuid, h.attribute_5 AS body, h.action_taken_by_name AS author,
              h.contr_term_id AS clause_id
       FROM dbo.cm_contracts_terms_hst h
       INNER JOIN dbo.cm_contracts_terms t ON t.id = h.contr_term_id
       WHERE t.contractrefno = $1 AND h.action = 'Comment'
         AND (h.attribute_2 IS NULL OR h.attribute_2 != 'Y')
       ORDER BY h.action_date ASC`,
      [id]
    );
    // UUID-keyed map (for spans that have data-comment-id)
    const commentMap: Record<string, { body: string; author: string }> = {};
    // Clause-ID-keyed map (fallback for legacy spans without data-comment-id)
    const clauseCommentMap: Record<string, { body: string; author: string }[]> = {};
    commentRows.forEach((r: any) => {
      if (r.uuid) commentMap[r.uuid] = { body: r.body || "", author: r.author || "User" };
      if (r.clause_id) {
        const key = String(r.clause_id);
        if (!clauseCommentMap[key]) clauseCommentMap[key] = [];
        clauseCommentMap[key].push({ body: r.body || "", author: r.author || "User" });
      }
    });

    const { rows: sowRows } = await tenantPool.query(
      `SELECT type, description, quantity, uom, unit_cost, total_cost, start_date, deliverydate
       FROM dbo.cm_sow
       WHERE parent_id = $1 AND (del_status IS NULL OR del_status != 'Y')
       ORDER BY id`,
      [id]
    );

    let firstPartyOrg: any = null;
    const attribute7: string = contract.attribute_7 || "";
    if (attribute7.trim()) {
      const ids = attribute7.split(",").map((s: string) => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        const firstId = parseInt(ids[0]);
        if (!isNaN(firstId)) {
          const { rows: orgRows } = await tenantPool.query(
            `SELECT id, organization_name, org_legal_address, org_city, org_state, org_country,
                    org_postalcode, org_registration_no, authorised_representative
             FROM dbo.um_org_dtls WHERE id = $1 LIMIT 1`,
            [firstId]
          );
          firstPartyOrg = orgRows[0] || null;
        }
      }
    }

    const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const getOrdinal = (d: number) => {
      if (d >= 11 && d <= 13) return `${d}th`;
      switch (d % 10) {
        case 1: return `${d}st`;
        case 2: return `${d}nd`;
        case 3: return `${d}rd`;
        default: return `${d}th`;
      }
    };

    const monthNames = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
    const formatDate = (d: any) => {
      if (!d) return "N/A";
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return String(d);
      return dt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    };
    const getAgreementDate = (d: any) => {
      const dt = d ? new Date(d) : new Date();
      return { day: getOrdinal(dt.getDate()), month: monthNames[dt.getMonth()], year: dt.getFullYear() };
    };

    const orgFallback = contract.org_name || "Organization";
    const firstPartyName = firstPartyOrg?.organization_name || orgFallback;
    const secondPartyName = vendor?.supplier_name || "Vendor";
    const contractTitle = contract.title || "Contract Document";
    const refNo = contract.contr_ref_no || String(contract.id);
    const version = contract.version || "1.0";

    const buildFirstPartyAddr = (org: any) => {
      if (!org) return "";
      const parts: string[] = [];
      if (org.org_legal_address) parts.push(org.org_legal_address);
      if (org.org_city) parts.push(org.org_city);
      if (org.org_state) parts.push(org.org_state);
      if (org.org_country) parts.push(org.org_country);
      const addr = parts.join(", ");
      const postal = org.org_postalcode ? ` - ${org.org_postalcode}` : "";
      const trn = org.org_registration_no ? ` TRN: ${org.org_registration_no}` : "";
      const rep = org.authorised_representative ? ` represented by the authorised representative Mr. ${org.authorised_representative}` : "";
      return `Address: ${addr}${postal}${trn}${rep}`;
    };

    const firstPartyAddr = buildFirstPartyAddr(firstPartyOrg);
    const suppContactName = vendor?.attribute_1 || vendor?.supplier_contact || "Authorized Representative";
    const suppDesignationStr = vendor?.attribute_3 || "";
    const suppAddr = vendor?.supplier_site || "";
    const orgRepName = firstPartyOrg?.authorised_representative || contract.org_signer_name || "Authorised Representative";
    const orgSigner = contract.org_signer_name || orgRepName;
    const orgDesignation = contract.org_signer_designation || "";
    const suppSigner = contract.supp_signer_name || suppContactName;
    const suppSignerDesig = contract.supp_signer_designation || suppDesignationStr;

    // Signing state
    const isPendingSign = contract.status === "Approved";
    const orgSigned = !!contract.org_sign_date;
    const suppSigned = !!contract.supp_sign_date;
    const orgSignDate = contract.org_sign_date ? formatDate(contract.org_sign_date) : "";
    const suppSignDate = contract.supp_sign_date ? formatDate(contract.supp_sign_date) : "";
    const orgSignData = contract.org_sign_data || "";
    const suppSignData = contract.supp_sign_data || "";

    const agDate = getAgreementDate(contract.start_date);

    const clauses = clauseRows.filter((c: any) =>
      !(c.terms_name || "").toLowerCase().includes("general addendum")
    );

    const hasSow = sowRows.length > 0;

    const tocRows = [
      ...clauses.map((c: any, i: number) =>
        `<tr data-toc-idx="${i}"><td class="toc-num">${i + 1}.</td><td class="toc-title">${esc(c.terms_name)}</td><td class="toc-dots"></td><td class="toc-page" data-toc-page>—</td></tr>`
      ),
      ...(hasSow ? [`<tr data-toc-sow><td class="toc-num"></td><td class="toc-title"><strong>Appendix A &ndash; Scope of Work</strong></td><td class="toc-dots"></td><td class="toc-page" data-toc-page>—</td></tr>`] : []),
    ].join("");

    const glossaryItems: Array<[string, string]> = [
      ["AED", "means UAE currency abbreviation."],
      ["Agreement", "and similar expressions mean this Vendor Portal Implementation Agreement including all its Appendixes and all instruments supplementing, amending, or confirming this Agreement. All references to Articles or Sections mean and refer to the specified Article or Section of this Agreement except where a different agreement is explicitly identified."],
      ["First Party", " means the entity preparing and submitting the Proposal."],
      ["Second Party", "means the entity for whom the Proposal is prepared"],
      ["Ajman", "means the Emirate of Ajman, a city in the United Arab Emirates."],
      ["AQAAR", "refers to Ajman Properties Corporation, Ajman, United Arab Emirates."],
      ["Change Order", "means any written documentation between the First Party and Second Party evidencing their agreement to change aspects of this Agreement."],
      ["Technical Proposal", "means the Proposal prepared by First Party for Second Party describing the technical solution, scope of work, and implementation methodology"],
      ["Commercial Proposal", "means the Proposal prepared by First Party for Second Party setting out the pricing, payment terms, and other commercial conditions"],
      ["Force Majeure", "means any event or circumstances beyond the reasonable control of and without the fault or negligence of the Party claiming the existence of such event, which shall include, without limitation, failure or interruption of the production, delivery or acceptance of electricity due to: an act of god; war (declared or undeclared); sabotage; riot; insurrection; civil unrest or disturbance; military or guerrilla action; terrorism; economic sanction or embargo; widespread civil strike, work stoppage, slow-down, or lock-out; explosion; fire; earthquake; abnormal weather condition or actions of the elements; hurricane; flood; lightning; wind and drought."],
      ["ITD", "means Information Technology Department."],
      ["SLA", "means Service Level Agreement."],
      ["UAE", "means United Arab Emirates."],
    ];

    const glossaryHtml = glossaryItems.map(([term, def]) =>
      `<div class="glossary-item"><span class="gloss-term">&quot;${esc(term)}&quot;</span> ${def}</div>`
    ).join("\n");

    // ── Footer helpers ──────────────────────────────────────────────
    const footerRefParts = refNo.split("-");
    const footerRef = footerRefParts.length > 1
      ? [...footerRefParts.slice(0, -1), "F", footerRefParts[footerRefParts.length - 1]].join("-")
      : refNo;
    const revisionDisplay = (version || "0").toString().includes(".") ? (version || "0") : `${version || "0"}.0`;
    const todayD = new Date();
    const todayFormatted = `${String(todayD.getDate()).padStart(2, "0")}/${String(todayD.getMonth() + 1).padStart(2, "0")}/${todayD.getFullYear()}`;
    // totalPages is updated dynamically by the JS pager once it knows how many clause pages result
    const totalPages = 5 + clauses.length + (hasSow ? 1 : 0); // initial estimate, JS pager corrects this
    const confidentialityText = "This document is the property of First Party. It must not be reproduced in whole or in part or otherwise disclosed without prior written consent.";
    const pageFooter = (n: number) => `
<div class="page-footer">
  <div class="footer-top">
    <span>${esc(footerRef)}</span>
    <span>Revision ${esc(revisionDisplay)}; Dated: ${todayFormatted}</span>
    <span>Page ${n} of ${totalPages}</span>
  </div>
  <div class="footer-bottom">${confidentialityText}</div>
</div>`;

    // Build a map of contract field variables → actual values for {{variable}} substitution
    const contractVariableMap: Record<string, string> = {
      // Status & reference
      status: contract.status || "",
      version: contract.version || "",
      contr_ref_no: contract.contr_ref_no || String(contract.id),
      ref_no: contract.contr_ref_no || String(contract.id),
      contract_ref_no: contract.contr_ref_no || String(contract.id),
      // Title & description
      title: contract.title || "",
      description: contract.description || "",
      // Dates
      start_date: contract.start_date ? formatDate(contract.start_date) : "",
      end_date: contract.end_date ? formatDate(contract.end_date) : "",
      creation_date: contract.creation_date ? formatDate(contract.creation_date) : "",
      // Parties
      org_name: contract.org_name || "",
      organization: contract.org_name || "",
      first_party: firstPartyName,
      second_party: secondPartyName,
      supplier_name: vendor?.supplier_name || "",
      vendor_name: vendor?.supplier_name || "",
      // Owner / department
      owner_name: contract.owner_name || "",
      owner: contract.owner_name || "",
      department: contract.department_name || "",
      department_name: contract.department_name || "",
      // Financial
      currency: contract.currency || "",
      contract_amount: contract.contract_amount || "",
      amount: contract.contract_amount || "",
      // Project
      project_name: contract.project_name || "",
      project_ref_no: contract.project_ref_no || "",
      // Signers
      org_signer_name: contract.org_signer_name || orgSigner,
      org_signer_designation: contract.org_signer_designation || orgDesignation,
      supp_signer_name: contract.supp_signer_name || suppSigner,
      supp_signer_designation: contract.supp_signer_designation || suppSignerDesig,
    };

    const replaceVariables = (html: string): string =>
      html.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
        const k = key.trim().toLowerCase();
        return contractVariableMap[k] !== undefined ? contractVariableMap[k] : _match;
      });

    const clauseSectionsInner = clauses.map((c: any, i: number) => {
      const rawHtml = c.term_details || "<p><em>No content provided.</em></p>";
      // Replace {{variable}} placeholders with actual contract values
      const resolvedHtml = replaceVariables(rawHtml);
      // Transform <insert> and <delete> custom elements into styled <span> elements
      const htmlContent = resolvedHtml
        .replace(/<insert(\s[^>]*)?>/gi, '<span class="tc-insert"$1>')
        .replace(/<\/insert>/gi, '</span>')
        .replace(/<delete(\s[^>]*)?>/gi, '<span class="tc-delete"$1>')
        .replace(/<\/delete>/gi, '</span>');
      return `<div class="clause-section" data-clause-id="${c.id}" data-clause-idx="${i}"><h2 class="clause-heading">${i + 1}. ${esc(c.terms_name)}</h2><div class="clause-body">${htmlContent}</div></div>`;
    }).join("");

    // Data passed to the in-page JS pager
    const clauseFooterData = JSON.stringify({
      footerRef: footerRef,
      rev: revisionDisplay,
      dated: todayFormatted,
      totalPages: totalPages,
      startPage: 6,
      confidentiality: confidentialityText,
      hasSow: hasSow,
      fixedPages: 5, // pages before clause sections (title, TOC, glossary, intro, parties)
    });

    const clauseSections = clauses.length === 0 ? "" : `
<!-- ══════════════ CLAUSE SECTIONS (JS-paginated) ══════════════ -->
<!-- Hidden off-screen container used only for height measurement -->
<div id="clause-measure" style="position:fixed;left:-99999px;top:0;width:170mm;visibility:hidden;pointer-events:none;font-family:'Times New Roman',Times,serif;font-size:11pt;line-height:1.65;">
  ${clauseSectionsInner}
</div>
<!-- Pages injected here by buildClausePages() -->
<div id="clause-pages"></div>
<script>
(function(){
  var D = ${clauseFooterData};

  function makeFooter(n) {
    return '<div class="page-footer">' +
      '<div class="footer-top">' +
      '<span>' + D.footerRef + '</span>' +
      '<span>Revision ' + D.rev + '; Dated: ' + D.dated + '</span>' +
      '<span>Page ' + n + ' of ' + D.totalPages + '</span>' +
      '</div>' +
      '<div class="footer-bottom">' + D.confidentiality + '</div>' +
      '</div>';
  }

  function build() {
    var mEl = document.getElementById('clause-measure');
    var pEl = document.getElementById('clause-pages');
    if (!mEl || !pEl) return;

    var sections = Array.from(mEl.querySelectorAll('.clause-section'));
    if (!sections.length) { mEl.remove(); return; }

    /* Available content height per page:
       A4 = 297mm. Top pad = 22mm, bottom pad = 22mm.
       Remaining = 253mm. Footer ~55px + 12px gap = 67px.
       1mm ≈ 3.7795px  →  253mm ≈ 956px  →  956 - 67 = 889px available. */
    var MM = 3.7795275591;
    var availH = (297 - 22 - 22) * MM - 80;   /* 80px buffer for footer + gaps */

    /* Group clause divs into page buckets */
    var pages = [], grp = [], acc = 0;
    sections.forEach(function(el) {
      var h = el.offsetHeight + 36; /* 36 = bottom margin + separator */
      if (acc + h > availH && grp.length) { pages.push(grp); grp = []; acc = 0; }
      grp.push(el); acc += h;
    });
    if (grp.length) pages.push(grp);

    /* Compute actual total pages now that we know how many clause pages there are */
    var actualTotalPages = D.fixedPages + pages.length + (D.hasSow ? 1 : 0);

    /* Update all "Page X of Y" footers on earlier fixed pages */
    if (actualTotalPages !== D.totalPages) {
      document.querySelectorAll('.page-footer .footer-top span:last-child').forEach(function(span) {
        span.textContent = span.textContent.replace(/of \d+/, 'of ' + actualTotalPages);
      });
    }

    /* Build a clause-index → page-number map from the page buckets */
    var clausePageMap = {};
    pages.forEach(function(bucket, pi) {
      var pageNum = D.startPage + pi;
      bucket.forEach(function(el) {
        var idx = el.getAttribute('data-clause-idx');
        if (idx !== null) clausePageMap[idx] = pageNum;
      });
    });

    /* Patch TOC page numbers */
    document.querySelectorAll('[data-toc-idx]').forEach(function(row) {
      var idx = row.getAttribute('data-toc-idx');
      var cell = row.querySelector('[data-toc-page]');
      if (cell && clausePageMap[idx] !== undefined) {
        cell.textContent = clausePageMap[idx];
      }
    });

    /* Patch SOW TOC row if present */
    var sowRow = document.querySelector('[data-toc-sow]');
    if (sowRow) {
      var sowCell = sowRow.querySelector('[data-toc-page]');
      if (sowCell) sowCell.textContent = D.fixedPages + pages.length + 1;
    }

    /* Render one .page div per bucket */
    pages.forEach(function(bucket, pi) {
      var page = document.createElement('div');
      page.className = 'page page-break-before';

      var wrap = document.createElement('div');
      wrap.className = 'clause-page-content';
      bucket.forEach(function(el) { wrap.appendChild(el.cloneNode(true)); });
      page.appendChild(wrap);

      var ft = document.createElement('div');
      ft.innerHTML = makeFooter(D.startPage + pi);
      if (ft.firstElementChild) page.appendChild(ft.firstElementChild);

      pEl.appendChild(page);
    });

    mEl.remove();
  }

  function init() {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(build);
    } else {
      setTimeout(build, 120);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
</script>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(contractTitle)} &mdash; Contract Preview</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4; margin: 22mm 20mm 26mm 20mm; }
  body { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #1a1a1a; background: #f3f4f6; line-height: 1.55; overflow-x: hidden; }

  .toolbar { position: fixed; top: 0; left: 0; right: 0; z-index: 999; background: #f8fafc; color: #475569; border-bottom: 1px solid #e2e8f0; padding: 6px 16px; display: flex; align-items: center; gap: 8px; font-family: sans-serif; font-size: 12px; }
  .toolbar .doc-label { color: #64748b; font-size: 11px; font-weight: 500; }
  .toolbar button { background: #fff; color: #475569; border: 1px solid #cbd5e1; border-radius: 5px; padding: 4px 10px; font-size: 11px; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: color .15s, border-color .15s, background .15s; }
  .toolbar button:hover { color: #1e293b; border-color: #94a3b8; background: #f1f5f9; }
  @media print { .toolbar { display: none !important; } body { background: #fff; } }

  .pages { margin-top: 38px; padding: 20px 0; overflow-x: hidden; }
  @media print { .pages { margin-top: 0; padding: 0; } }

  .page { width: min(210mm, calc(100vw - 24px)); min-height: 290mm; margin: 0 auto 28px; padding: 22mm 20mm 22mm; background: #fff; box-shadow: 0 2px 14px rgba(0,0,0,.13); position: relative; box-sizing: border-box; display: flex; flex-direction: column; }
  @media (max-width: 700px) { .page { padding: 14mm 12mm; } }
  @media print { .page { box-shadow: none; margin: 0; padding: 18mm 18mm 18mm; width: 100%; min-height: 250mm; } }
  .page-break-before { break-before: page; page-break-before: always; }

  /* ── Clause page content wrapper ── */
  .clause-page-content { flex: 1; }
  .clause-section { margin-bottom: 28px; break-inside: avoid; page-break-inside: avoid; overflow: hidden; max-width: 100%; }
  .clause-section:not(:last-child) { padding-bottom: 20px; border-bottom: 1px solid #e5e7eb; }

  /* ── Title page ── */
  .title-page { display: flex; flex-direction: column; align-items: center; min-height: 250mm; }
  .title-page .logo-wrap { margin: 0 auto 20px; width: 80px; height: 80px; border-radius: 50%; background: #e2e8f0; display: flex; align-items: center; justify-content: center; }
  .title-page .logo-wrap svg { width: 44px; height: 44px; color: #475569; }
  .title-page .org-name { font-size: 13pt; font-weight: bold; color: #1e293b; text-align: center; margin-bottom: 6px; }
  .title-page .sep-heavy { width: 100%; border: none; border-top: 2.5px solid #1e293b; margin: 10px 0 4px; }
  .title-page .sep-light { width: 100%; border: none; border-top: 1px solid #94a3b8; margin: 4px 0 10px; }
  .title-page .spacer { flex: 1; min-height: 40px; }
  .title-page .vendor-name { font-size: 18pt; font-weight: bold; text-transform: uppercase; letter-spacing: .5px; text-align: center; margin-bottom: 8px; }
  .title-page .contract-title { font-size: 13pt; font-weight: bold; text-transform: uppercase; color: #374151; text-align: center; margin-bottom: 24px; }
  .title-page .doc-sep { width: 100%; border: none; border-top: 1.5px solid #1e293b; margin: 10px 0 14px; }
  .title-page .doc-info { font-size: 10pt; color: #4b5563; text-align: center; }

  /* ── Section title (used in TOC, Glossary pages) ── */
  .section-title { font-size: 14pt; font-weight: bold; text-align: center; letter-spacing: .3px; margin-bottom: 6px; }
  .section-rule { border: none; border-top: 1.5px solid #1e293b; margin-bottom: 18px; }

  /* ── TOC ── */
  .toc-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .toc-table td { padding: 5px 4px; font-size: 11pt; vertical-align: bottom; }
  .toc-num { width: 30px; white-space: nowrap; color: #374151; }
  .toc-title { font-weight: bold; }
  .toc-dots { border-bottom: 1px dotted #94a3b8; min-width: 80px; }
  .toc-page { text-align: right; white-space: nowrap; width: 44px; font-weight: bold; color: #1e40af; }

  /* ── Glossary ── */
  .glossary-item { margin-bottom: 7px; text-align: justify; line-height: 1.6; border: 1px solid #1a1a1a; padding: 6px 8px; }
  .gloss-term { font-weight: bold; }

  /* ── Introduction (legal text) ── */
  .legal-body { font-size: 11pt; line-height: 1.7; text-align: justify; }
  .legal-body p { margin-bottom: 10px; }
  .legal-body .party-name { font-weight: bold; }
  .legal-body .indent { margin-left: 28px; margin-bottom: 10px; }
  .legal-body .center-bold { text-align: center; font-weight: bold; font-size: 12pt; margin: 14px 0; }
  .legal-body .clause-item { margin-bottom: 8px; line-height: 1.6; }
  .preamble-heading { font-size: 12pt; font-weight: bold; margin: 12px 0 6px; }

  /* ── Signatory ── */
  .sign-section { margin-top: 0; }
  .sign-title { font-size: 14pt; font-weight: bold; text-align: center; margin-bottom: 6px; }
  .sign-rule { border: none; border-top: 1.5px solid #1e293b; margin-bottom: 20px; }
  .sign-party-label { font-size: 11pt; font-weight: bold; margin-bottom: 6px; }
  .sign-content { margin-left: 28px; margin-bottom: 16px; font-size: 11pt; line-height: 1.7; }
  .sign-line-right { text-align: right; font-size: 11pt; letter-spacing: 1px; margin-top: 24px; }
  .sign-above { text-align: right; font-size: 10pt; color: #6b7280; margin-top: 2px; }
  .sign-statement { text-align: right; font-size: 10.5pt; line-height: 1.6; margin-top: 8px; }
  .blank-lines { text-align: center; margin-top: 36px; }
  .blank-lines p { margin-bottom: 14px; font-size: 12pt; letter-spacing: 2px; color: #374151; }

  /* ── Signing widgets ── */
  .sign-here-btn {
    display: inline-flex; align-items: center; gap: 10px;
    background: #fff; color: #1e3a5f;
    border: 1.5px solid #2563eb;
    border-left: 4px solid #2563eb;
    border-radius: 4px; padding: 10px 20px;
    font-size: 10.5pt; font-weight: 600;
    cursor: pointer; margin-bottom: 2px;
    box-shadow: 0 1px 4px rgba(37,99,235,.10);
    font-family: Arial, Helvetica, sans-serif; letter-spacing: 0.2px;
    transition: background .15s, box-shadow .15s;
  }
  .sign-here-btn:hover {
    background: #eff6ff;
    box-shadow: 0 2px 10px rgba(37,99,235,.18);
  }
  .sign-here-btn::before {
    content: "✦";
    font-size: 11pt; color: #2563eb; flex-shrink: 0;
  }
  .sign-btn-label { display: flex; flex-direction: column; line-height: 1.25; }
  .sign-btn-label span:first-child { font-size: 8pt; font-weight: 400; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; }
  .sign-btn-label span:last-child { font-size: 11pt; font-weight: 700; color: #1e3a5f; }
  .sign-done-block {
    display: flex; flex-direction: column; align-items: flex-end; gap: 2px;
    margin-bottom: 8px;
  }
  .sign-done-img { max-height: 56px; max-width: 240px; }
  .sign-done-name {
    font-family: 'Brush Script MT', 'Segoe Script', cursive;
    font-size: 22pt; color: #1e40af; line-height: 1.1;
  }
  .sign-done-check { color: #16a34a; font-size: 10pt; font-family: Arial, Helvetica, sans-serif; }
  .sign-here-disabled {
    background: #f8fafc !important; color: #94a3b8 !important;
    border-color: #cbd5e1 !important; border-left-color: #94a3b8 !important;
    cursor: not-allowed !important; box-shadow: none !important; opacity: 0.75;
  }
  .sign-here-disabled::before { content: "🔒"; font-size: 10pt; color: #94a3b8 !important; }
  .sign-no-auth {
    display: inline-flex; align-items: center; gap: 8px;
    background: #fff7ed; color: #c2410c; border: 1.5px solid #fed7aa;
    border-radius: 6px; padding: 8px 16px; font-size: 11pt; font-weight: 700;
    font-family: Arial, Helvetica, sans-serif;
  }
  .sign-no-auth-icon { font-size: 14pt; }
  .sign-no-auth-hint {
    font-size: 9.5pt; color: #9a3412; margin-top: 5px;
    font-family: Arial, Helvetica, sans-serif; font-style: italic;
  }
  .sign-auth-required {
    font-size: 9.5pt; color: #4b5563; margin-top: 5px;
    font-family: Arial, Helvetica, sans-serif;
  }
  @media print { .sign-here-btn { display: none; } .sign-overlay { display: none !important; } }

  /* ── In-page signing overlay ── */
  .sign-overlay {
    display: none; position: fixed; inset: 0; z-index: 9999;
    background: rgba(15,23,42,0.55); align-items: center; justify-content: center;
  }
  .sign-overlay.active { display: flex; }
  .sign-panel {
    background: #fff; border-radius: 12px; padding: 28px 32px; width: 520px; max-width: 95vw;
    box-shadow: 0 20px 60px rgba(0,0,0,.35); font-family: Arial, Helvetica, sans-serif;
  }
  .sign-panel-title { font-size: 17px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
  .sign-panel-sub { font-size: 12px; color: #6b7280; margin-bottom: 16px; }
  .sign-tabs { display: flex; border-bottom: 2px solid #e2e8f0; margin-bottom: 16px; gap: 2px; }
  .sign-tab {
    padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer;
    border: none; background: none; color: #94a3b8; border-bottom: 2px solid transparent;
    margin-bottom: -2px; transition: color .15s;
  }
  .sign-tab.active { color: #2563eb; border-bottom-color: #2563eb; }
  .sign-tab-pane { display: none; }
  .sign-tab-pane.active { display: block; }
  .sign-canvas-wrap {
    border: 2px dashed #cbd5e1; border-radius: 8px; background: #f8fafc;
    position: relative; overflow: hidden; cursor: crosshair;
  }
  #signCanvas { display: block; width: 100%; height: 160px; }
  .sign-canvas-hint {
    position: absolute; bottom: 8px; right: 12px; font-size: 10px;
    color: #cbd5e1; pointer-events: none; font-style: italic;
  }
  .sign-clear-btn {
    background: none; border: none; color: #94a3b8; font-size: 12px;
    cursor: pointer; text-decoration: underline; margin-top: 6px; padding: 0;
  }
  .sign-type-input {
    width: 100%; border: 1.5px solid #e2e8f0; border-radius: 6px;
    padding: 10px 12px; font-size: 14px; outline: none; box-sizing: border-box;
    transition: border-color .15s;
  }
  .sign-type-input:focus { border-color: #2563eb; }
  .sign-type-preview {
    margin-top: 12px; min-height: 80px; border: 1.5px solid #e2e8f0;
    border-radius: 8px; background: #f8fafc; display: flex;
    align-items: center; justify-content: center; padding: 8px;
  }
  .sign-type-preview span {
    font-family: 'Brush Script MT','Segoe Script',cursive;
    font-size: 2.4rem; color: #1e40af; line-height: 1.1;
  }
  .sign-legal {
    font-size: 11px; color: #64748b; background: #f1f5f9; border-radius: 6px;
    padding: 10px 12px; margin: 14px 0; line-height: 1.5;
  }
  .sign-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
  .sign-btn-cancel {
    padding: 9px 20px; border: 1.5px solid #e2e8f0; border-radius: 6px;
    background: #fff; font-size: 13px; font-weight: 600; cursor: pointer; color: #374151;
  }
  .sign-btn-submit {
    padding: 9px 22px; border: none; border-radius: 6px; background: #2563eb;
    color: #fff; font-size: 13px; font-weight: 700; cursor: pointer;
    transition: background .15s; min-width: 140px;
  }
  .sign-btn-submit:hover { background: #1d4ed8; }
  .sign-btn-submit:disabled { background: #93c5fd; cursor: not-allowed; }

  /* ── Clause sections ── */
  .clause-heading { font-size: 13pt; font-weight: bold; margin-bottom: 12px; color: #1e293b; border-left: 4px solid #3b82f6; padding-left: 10px; padding-top: 2px; padding-bottom: 2px; }
  .clause-body { font-size: 11pt; line-height: 1.65; text-align: justify; word-break: break-word; overflow-wrap: break-word; }
  .clause-body p { margin-bottom: 8px; }
  .clause-body ul, .clause-body ol { padding-left: 22px; margin-bottom: 8px; }
  .clause-body li { margin-bottom: 4px; }
  .clause-body table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  .clause-body table td, .clause-body table th { border: 1px solid #d1d5db; padding: 6px 10px; font-size: 10.5pt; }
  .clause-body table th { background: #f1f5f9; font-weight: bold; }
  .clause-body strong, .clause-body b { font-weight: bold; }
  .clause-body em, .clause-body i { font-style: italic; }

  /* ── Page footer ── */
  .page-footer { margin-top: auto; padding-top: 12px; border-top: 1px solid #374151; font-family: Arial, Helvetica, sans-serif; font-size: 7.5pt; color: #374151; flex-shrink: 0; }
  .clauses-page .page-footer { margin-top: 24px; }
  .page-footer .footer-top { display: flex; justify-content: space-between; margin-bottom: 3px; }
  .page-footer .footer-bottom { text-align: center; font-style: italic; color: #4b5563; }

  /* ── Track Changes ── */
  .tc-insert { display:inline; color:#166534; text-decoration:underline; text-decoration-color:#16a34a; background:#dcfce7; border-radius:2px; padding:0 2px; font-weight:500; }
  .tc-delete { display:inline; color:#991b1b; text-decoration:line-through; text-decoration-color:#dc2626; background:#fee2e2; border-radius:2px; padding:0 2px; }

  /* ── Inline Comments ── */
  .comment-mark { background:#fef9c3; border-bottom:2px solid #eab308; border-radius:1px; }
  .tc-tip { position:fixed; z-index:9999; background:#1e293b; color:#f8fafc; font-family:Arial,sans-serif; font-size:9pt; padding:7px 11px; border-radius:7px; max-width:240px; white-space:normal; line-height:1.45; box-shadow:0 4px 16px rgba(0,0,0,.28); pointer-events:none; }
  .tc-tip::after { content:''; position:absolute; top:100%; left:14px; border:6px solid transparent; border-top-color:#1e293b; }

  /* ── Track-changes legend in toolbar ── */
  .tc-legend { display:flex; align-items:center; gap:10px; font-family:Arial,sans-serif; font-size:11px; margin-left:12px; padding-left:12px; border-left:1px solid #e2e8f0; }
  .tc-legend .ins { color:#166534; text-decoration:underline; background:#dcfce7; padding:0 3px; border-radius:2px; font-weight:500; }
  .tc-legend .del { color:#991b1b; text-decoration:line-through; background:#fee2e2; padding:0 3px; border-radius:2px; }
  .tc-legend .cmt { background:#fef9c3; border-bottom:1px solid #eab308; padding:0 3px; }
  @media print { .tc-legend { display:none; } }
</style>
</head>
<body>

<div class="toolbar">
  <span class="doc-label">${esc(contractTitle)}</span>
  <span style="margin-left:auto;opacity:.5;font-size:11px;">Ref: ${esc(refNo)}</span>
  <button onclick="window.print()" title="Print or Save as PDF">
    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
    Print / PDF
  </button>
  <div class="tc-legend" id="tc-legend">
    <span class="ins" id="legend-ins">&#x2795; Inserted</span>
    <span class="del" id="legend-del">&#x2796; Deleted</span>
    <span class="cmt" id="legend-cmt">💬 Comment (hover)</span>
  </div>
</div>
<script>
(function(){
  /* UUID → comment (for spans that store data-comment-id) — only UNRESOLVED */
  var C = ${JSON.stringify(commentMap)};
  /* clause-id → [comments] (fallback for legacy spans without data-comment-id) */
  var CC = ${JSON.stringify(clauseCommentMap)};
  var tip = null;
  function escH(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function renderTip(c){
    if(!c || tip) return;
    tip = document.createElement('div');
    tip.className = 'tc-tip';
    tip.innerHTML = '<strong>' + escH(c.author) + '</strong>: ' + escH(c.body);
    document.body.appendChild(tip);
  }
  function moveTip(e){
    if(!tip) return;
    tip.style.left = (e.clientX + 14) + 'px';
    tip.style.top  = (e.clientY - tip.offsetHeight - 10) + 'px';
  }
  function hideTip(){
    if(tip){ tip.remove(); tip = null; }
  }
  function resolveComment(el){
    /* 1. Try UUID on the span itself */
    var uuid = el.getAttribute('data-comment-id');
    if(uuid && C[uuid]) return C[uuid];
    /* 2. Fallback: look up by the nearest clause-section's data-clause-id */
    var section = el.closest && el.closest('.clause-section[data-clause-id]');
    if(section){
      var arr = CC[section.getAttribute('data-clause-id')];
      if(arr && arr.length) return arr[0];
    }
    return null;
  }
  /* Event delegation — works for both original and pager-cloned elements */
  document.addEventListener('mouseover', function(e){
    var el = e.target && e.target.closest && e.target.closest('.comment-mark');
    if(el){ renderTip(resolveComment(el)); }
  });
  document.addEventListener('mouseout', function(e){
    var to = e.relatedTarget;
    var el = e.target && e.target.closest && e.target.closest('.comment-mark');
    if(el && !(to && to.closest && to.closest('.comment-mark') === el)){ hideTip(); }
  });
  document.addEventListener('mousemove', moveTip);

  /* After content loads: strip resolved comment highlights + hide legend items with no content */
  document.addEventListener('DOMContentLoaded', function(){
    /* Remove .comment-mark styling from spans whose comment is resolved (UUID not in active C map) */
    document.querySelectorAll('.comment-mark').forEach(function(el){
      var uuid = el.getAttribute('data-comment-id');
      if(uuid){
        if(!C[uuid]) el.classList.remove('comment-mark');
      } else {
        /* No UUID — check fallback clause map */
        var section = el.closest && el.closest('.clause-section[data-clause-id]');
        var hasActive = section && CC[section.getAttribute('data-clause-id')] && CC[section.getAttribute('data-clause-id')].length;
        if(!hasActive) el.classList.remove('comment-mark');
      }
    });

    /* Show each legend item only when the document has matching elements */
    var hasInserts  = !!document.querySelector('.tc-insert');
    var hasDeletes  = !!document.querySelector('.tc-delete');
    var hasComments = !!document.querySelector('.comment-mark');

    var legendIns = document.getElementById('legend-ins');
    var legendDel = document.getElementById('legend-del');
    var legendCmt = document.getElementById('legend-cmt');
    var legend    = document.getElementById('tc-legend');

    if(legendIns) legendIns.style.display = hasInserts  ? '' : 'none';
    if(legendDel) legendDel.style.display = hasDeletes  ? '' : 'none';
    if(legendCmt) legendCmt.style.display = hasComments ? '' : 'none';
    /* Hide entire legend bar if nothing to show */
    if(legend && !hasInserts && !hasDeletes && !hasComments) legend.style.display = 'none';
  });
})();
</script>

<div class="pages">

<!-- ══════════════ PAGE 1: TITLE PAGE ══════════════ -->
<div class="page title-page">
  <div class="logo-wrap">
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
  </div>
  <p class="org-name">${esc(firstPartyName)}</p>
  <hr class="sep-heavy"/>
  <hr class="sep-light"/>
  <div class="spacer" style="flex:0.2;min-height:16px;max-height:24mm;"></div>
  <p class="vendor-name">${esc(secondPartyName)}</p>
  <p class="contract-title">${esc(contractTitle)}</p>
  <hr class="doc-sep"/>
  <p class="doc-info">
    Document Ref: ${esc(refNo)} &nbsp;&bull;&nbsp; Version ${esc(version)} &nbsp;&bull;&nbsp; ${formatDate(contract.start_date || new Date())}
  </p>
  <div class="spacer"></div>
  ${pageFooter(1)}
</div>

<!-- ══════════════ PAGE 2: TABLE OF CONTENTS ══════════════ -->
<div class="page page-break-before">
  <p class="section-title">Table of Contents</p>
  <hr class="section-rule"/>
  <table class="toc-table">
    <tbody>
      ${tocRows}
    </tbody>
  </table>
  ${pageFooter(2)}
</div>

<!-- ══════════════ PAGE 3: GLOSSARY ══════════════ -->
<div class="page page-break-before">
  <p class="section-title">GLOSSARY</p>
  <hr class="section-rule"/>
  <p style="font-size:11pt;margin-bottom:14px;font-weight:bold;">Definitions:</p>
  <p style="font-size:11pt;margin-bottom:16px;text-align:justify;">
    Throughout this Agreement, except as otherwise expressly provided, the following words and expressions shall have <strong>the following meanings</strong>:
  </p>
  ${glossaryHtml}
  ${pageFooter(3)}
</div>

<!-- ══════════════ PAGE 4: INTRODUCTION ══════════════ -->
<div class="page page-break-before">
  <div class="legal-body">
    <p><strong>THIS AGREEMENT,</strong> is made on ${agDate.day} of ${agDate.month} ${agDate.year} by and between</p>

    <p class="indent">
      <span class="party-name">${esc(firstPartyName)}</span>
      ${firstPartyAddr ? ` a company incorporated under the UAE Laws and having its registered office at ${esc(firstPartyAddr)}` : ""}
    </p>

    <p class="indent">(Hereinafter referred to as the <strong>First Party</strong> and/or Aqaar)</p>

    <p class="center-bold">And</p>

    <p class="indent">
      <span class="party-name">${esc(secondPartyName)}</span>
      ${suppAddr ? ` Address: ${esc(suppAddr)}` : ""}
      ${suppContactName !== "Authorized Representative" ? ` represented by the authorised representative Mr. ${esc(suppContactName)}${suppDesignationStr ? ` (${esc(suppDesignationStr)})` : ""}` : ""}
    </p>

    <p>
      The First Party engages the Second Party to
      <strong>${esc(contract.title || "")}</strong>${contract.description ? `, <strong>${esc(contract.description)}</strong>` : ""},
      in accordance with the specifications outlined in this Agreement.
      The Second Party agrees to deliver these services within the stipulated Agreement Period.
    </p>

    <p><strong>(Together referred to as &ldquo;the Parties&rdquo; and individually as &ldquo;First Party&rdquo; and &ldquo;Second Party&rdquo;).</strong></p>

    <p>Now, therefore, the Parties agree as follows:</p>

    <p class="clause-item">
      <strong>A.</strong>&ensp;The First Party hereby engages the Second Party, and the Second Party agrees, to provide
      <strong>annual maintenance, support, and licensing services</strong>
      for the Document Management System (DMS) licensed by the First Party, in accordance with the terms, conditions, and specifications set forth in this Agreement.
    </p>

    <p class="clause-item">
      <strong>B.</strong>&ensp;The Second Party shall deliver the Services to the First Party in strict accordance with the provisions of this Agreement, including but not limited to system maintenance, updates, technical support, and license compliance, during the Agreement Period specified herein.
    </p>

    <p><strong>Therefore</strong> the parties herein in their full capacities have mutually agreed on the following terms and conditions:</p>

    <p class="preamble-heading">Preamble</p>
    <p>The preamble shall be considered to be an integral part of this Agreement and shall be read with it as one unit.</p>
  </div>
  ${pageFooter(4)}
</div>

<!-- ══════════════ PAGE 5: SIGNATORY (after Introduction, before Clauses) ══════════════ -->
<div class="page page-break-before">
  <div class="sign-section">
    <p class="sign-title">SIGNATORY</p>
    <hr class="sign-rule"/>

    <p class="sign-party-label">Second Party:</p>
    <div class="sign-content">
      ${(() => {
        // Priority: auth signatory contact > portal user > contract signer fallback
        const name2 = hasAuthSignatory ? authSignatoryName
          : (vendorPortalUserName || suppSigner || "Authorized Representative");
        const desig2 = hasAuthSignatory ? authSignatoryDesig
          : (vendorPortalUserDesig || suppSignerDesig || "");
        return `<p>Name: <strong>${esc(name2)}</strong></p>
      ${desig2 ? `<p>Designation: <strong>${esc(desig2)}</strong></p>` : ""}
      <p>as authorised representative for the Second Party</p>`;
      })()}
    </div>

    ${isPendingSign && !suppSigned ? `
    <div style="text-align:right;margin-bottom:2px;">
      ${isCurrentUserAuthSignatory ? `
      <button class="sign-here-btn"
        onclick="openSignPanel('second','${esc(hasAuthSignatory ? authSignatoryName : (vendorPortalUserName || suppSigner))}')">
        <span class="sign-btn-label"><span>Click to Sign</span><span>Sign Here</span></span>
      </button>` : hasAuthSignatory ? `
      <button class="sign-here-btn sign-here-disabled" disabled
        title="Only the authorized signatory (${esc(authSignatoryName)}) can sign this contract">
        <span class="sign-btn-label"><span>Restricted</span><span>Sign Here</span></span>
      </button>
      <p class="sign-auth-required">
        🔒 Only <strong>${esc(authSignatoryName)}</strong>${authSignatoryDesig ? ` (${esc(authSignatoryDesig)})` : ""} is authorized to sign on behalf of ${esc(secondPartyName)}
      </p>` : `
      <div class="sign-no-auth">
        <span class="sign-no-auth-icon">⚠</span>
        No Authorized Signatory Defined
      </div>
      <p class="sign-no-auth-hint">Please define an authorized signatory in the vendor contact details before signing.</p>`}
    </div>` : ""}

    ${suppSigned ? `
    <div class="sign-done-block">
      ${suppSignData ? `<img class="sign-done-img" src="${suppSignData}" alt="Signature"/>` : `<span class="sign-done-name">${esc(suppSigner)}</span>`}
      ${contract.supp_signer_designation ? `<span style="font-size:9.5pt;color:#374151;font-family:Arial,Helvetica,sans-serif;">${esc(contract.supp_signer_designation)}</span>` : ""}
      <span class="sign-done-check">✔ Signed on ${suppSignDate}</span>
    </div>` : ""}

    <p class="sign-line-right">________________________________________</p>
    <p class="sign-above">(Sign above)</p>
    <div class="sign-statement">
      <p>By executing this Agreement <strong>${esc(secondPartyName)}</strong></p>
      <p><strong>LLC &ndash; Second Party</strong> warrants that he/she is duly</p>
      <p>authorised to execute this Agreement on behalf of</p>
      <p>the Second Party</p>
    </div>

    <div style="margin-top:32px;"></div>

    <p class="sign-party-label">First Party:</p>
    <div class="sign-content">
      <p>Name: <strong>${esc(orgSigner)}</strong></p>
      ${orgDesignation ? `<p>Designation: <strong>${esc(orgDesignation)}</strong></p>` : ""}
      <p>as authorised representative for the First Party</p>
    </div>

    ${isPendingSign && !orgSigned ? `
    <div style="text-align:right;margin-bottom:2px;">
      <button class="sign-here-btn${isCurrentUserOrgSigner ? "" : " sign-here-disabled"}"
        ${isCurrentUserOrgSigner ? `onclick="openSignPanel('first','${esc(orgSigner)}')"` : `disabled title="Only the authorized signatory (${esc(orgSigner)}) can sign this contract"`}>
        <span class="sign-btn-label"><span>${isCurrentUserOrgSigner ? "Click to Sign" : "Restricted"}</span><span>Sign Here</span></span>
      </button>
      ${!isCurrentUserOrgSigner ? `
      <p class="sign-auth-required">
        🔒 Only <strong>${esc(orgSigner)}</strong>${orgDesignation ? ` (${esc(orgDesignation)})` : ""} is authorized to sign on behalf of ${esc(firstPartyName)}
      </p>` : ""}
    </div>` : ""}

    ${orgSigned ? `
    <div class="sign-done-block">
      ${orgSignData ? `<img class="sign-done-img" src="${orgSignData}" alt="Signature"/>` : `<span class="sign-done-name">${esc(orgSigner)}</span>`}
      ${orgDesignation ? `<span style="font-size:9.5pt;color:#374151;font-family:Arial,Helvetica,sans-serif;">${esc(orgDesignation)}</span>` : ""}
      <span class="sign-done-check">✔ Signed on ${orgSignDate}</span>
    </div>` : ""}

    <p class="sign-line-right">________________________________________</p>
    <p class="sign-above">(Sign above)</p>
    <div class="sign-statement">
      <p>By executing this Agreement <strong>${esc(firstPartyName)}</strong></p>
      <p><strong>&ndash; First Party</strong> warrants that he/she is</p>
      <p>duly authorised to execute this Agreement on</p>
      <p>behalf of the First Party</p>
    </div>

    <div class="blank-lines">
      <p>____________________________________________________________</p>
      <p>____________________________________________________________</p>
      <p>____________________________________________________________</p>
    </div>
  </div>
  ${pageFooter(5)}
</div>

<!-- ══════════════ CLAUSE SECTIONS ══════════════ -->
${clauseSections}

${hasSow ? `
<!-- ══════════════ APPENDIX A: SCOPE OF WORK ══════════════ -->
<div class="page page-break-before">
  <p class="section-title">APPENDIX A &ndash; SCOPE OF WORK</p>
  <hr class="section-rule"/>
  <p style="font-size:11pt;margin-bottom:14px;font-weight:bold;">Scope of Work Details:</p>
  <table style="width:100%;border-collapse:collapse;font-size:10pt;font-family:'Times New Roman',Times,serif;">
    <thead>
      <tr style="background:#e8e8e8;">
        <th style="border:1px solid #aaa;padding:6px 8px;text-align:left;">Type</th>
        <th style="border:1px solid #aaa;padding:6px 8px;text-align:left;">Item Description</th>
        <th style="border:1px solid #aaa;padding:6px 8px;text-align:center;">Qty</th>
        <th style="border:1px solid #aaa;padding:6px 8px;text-align:center;">Unit</th>
        <th style="border:1px solid #aaa;padding:6px 8px;text-align:right;">Unit Cost</th>
        <th style="border:1px solid #aaa;padding:6px 8px;text-align:right;">Total Cost</th>
        <th style="border:1px solid #aaa;padding:6px 8px;text-align:center;">Delivery Date</th>
      </tr>
    </thead>
    <tbody>
      ${sowRows.map((s: any) => `
      <tr>
        <td style="border:1px solid #ccc;padding:5px 8px;">${esc(s.type || "")}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;">${esc(s.description || "")}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:center;">${esc(s.quantity || "")}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:center;">${esc(s.uom || "")}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;">${s.unit_cost != null ? Number(s.unit_cost).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;">${s.total_cost != null ? Number(s.total_cost).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:center;">${s.deliverydate ? formatDate(s.deliverydate) : ""}</td>
      </tr>`).join("")}
    </tbody>
    ${(() => {
      const grandTotal = sowRows.reduce((sum: number, s: any) => sum + (s.total_cost ? Number(s.total_cost) : 0), 0);
      return grandTotal > 0 ? `
      <tfoot>
        <tr style="background:#f5f5f5;font-weight:bold;">
          <td colspan="5" style="border:1px solid #aaa;padding:6px 8px;text-align:right;">Grand Total</td>
          <td style="border:1px solid #aaa;padding:6px 8px;text-align:right;">${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="border:1px solid #aaa;padding:6px 8px;"></td>
        </tr>
      </tfoot>` : "";
    })()}
  </table>
  ${pageFooter(5 + clauses.length + 1)}
</div>` : ""}

</div><!-- /pages -->

${isPendingSign ? `
<!-- ══════════════ IN-PAGE SIGNING OVERLAY ══════════════ -->
<div class="sign-overlay" id="signOverlay">
  <div class="sign-panel">
    <div class="sign-panel-title" id="signPanelTitle">✎ Sign Contract</div>
    <div class="sign-panel-sub" id="signPanelSub"></div>

    <div class="sign-tabs">
      <button class="sign-tab active" onclick="switchTab('draw')">Draw Signature</button>
      <button class="sign-tab" onclick="switchTab('type')">Type Signature</button>
    </div>

    <div class="sign-tab-pane active" id="pane-draw">
      <div class="sign-canvas-wrap">
        <canvas id="signCanvas" width="460" height="160"></canvas>
        <span class="sign-canvas-hint">Draw your signature here</span>
      </div>
      <button class="sign-clear-btn" onclick="clearCanvas()">Clear</button>
    </div>

    <div class="sign-tab-pane" id="pane-type">
      <input class="sign-type-input" id="typeInput" type="text" placeholder="Type your full name"
        oninput="document.getElementById('typePreviewSpan').textContent=this.value"/>
      <div class="sign-type-preview">
        <span id="typePreviewSpan"></span>
      </div>
    </div>

    <div class="sign-legal">
      By clicking <strong>Sign Document</strong>, you confirm that your electronic signature is the legal equivalent of your handwritten signature on this agreement.
    </div>
    <div class="sign-actions">
      <button class="sign-btn-cancel" onclick="closeSignPanel()">Cancel</button>
      <button class="sign-btn-submit" id="signSubmitBtn" onclick="submitSignature()">Sign Document</button>
    </div>
  </div>
</div>

<script>
(function() {
  var contractId = '${id}';
  var currentParty = 'first';
  var currentMode = 'draw';
  var drawing = false;
  var canvas, ctx;

  function init() {
    canvas = document.getElementById('signCanvas');
    ctx = canvas.getContext('2d');
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseleave', stopDraw);
    canvas.addEventListener('touchstart', function(e){ e.preventDefault(); var t=e.touches[0]; var r=canvas.getBoundingClientRect(); ctx.beginPath(); ctx.moveTo((t.clientX-r.left)*(canvas.width/r.width),(t.clientY-r.top)*(canvas.height/r.height)); ctx.strokeStyle='#1e40af'; ctx.lineWidth=2.5; ctx.lineCap='round'; drawing=true; }, {passive:false});
    canvas.addEventListener('touchmove', function(e){ e.preventDefault(); if(!drawing)return; var t=e.touches[0]; var r=canvas.getBoundingClientRect(); ctx.lineTo((t.clientX-r.left)*(canvas.width/r.width),(t.clientY-r.top)*(canvas.height/r.height)); ctx.stroke(); }, {passive:false});
    canvas.addEventListener('touchend', function(){ drawing=false; });
  }

  function startDraw(e) {
    var r=canvas.getBoundingClientRect();
    ctx.beginPath(); ctx.moveTo((e.clientX-r.left)*(canvas.width/r.width),(e.clientY-r.top)*(canvas.height/r.height));
    ctx.strokeStyle='#1e40af'; ctx.lineWidth=2.5; ctx.lineCap='round'; ctx.lineJoin='round';
    drawing=true;
  }
  function draw(e) {
    if(!drawing)return;
    var r=canvas.getBoundingClientRect();
    ctx.lineTo((e.clientX-r.left)*(canvas.width/r.width),(e.clientY-r.top)*(canvas.height/r.height));
    ctx.stroke();
  }
  function stopDraw(){ drawing=false; }

  window.clearCanvas = function(){ if(ctx)ctx.clearRect(0,0,canvas.width,canvas.height); };

  window.switchTab = function(mode) {
    currentMode = mode;
    document.querySelectorAll('.sign-tab').forEach(function(t,i){ t.classList.toggle('active', (i===0&&mode==='draw')||(i===1&&mode==='type')); });
    document.getElementById('pane-draw').classList.toggle('active', mode==='draw');
    document.getElementById('pane-type').classList.toggle('active', mode==='type');
  };

  window.openSignPanel = function(party, name) {
    currentParty = party;
    document.getElementById('signPanelTitle').textContent = '\\u270E Sign Contract \u2014 ' + (party==='first'?'First Party':'Second Party');
    document.getElementById('signPanelSub').textContent = 'Signing as: ' + name;
    document.getElementById('signOverlay').classList.add('active');
    document.getElementById('typeInput').value = '';
    document.getElementById('typePreviewSpan').textContent = '';
    if(ctx) ctx.clearRect(0,0,canvas.width,canvas.height);
    switchTab('draw');
  };

  window.closeSignPanel = function() {
    document.getElementById('signOverlay').classList.remove('active');
  };

  window.submitSignature = function() {
    var signatureData = '';
    if(currentMode === 'draw') {
      signatureData = canvas.toDataURL('image/png');
    } else {
      var name = document.getElementById('typeInput').value.trim();
      if(!name){ alert('Please type your name to sign.'); return; }
      var c = document.createElement('canvas'); c.width=460; c.height=100;
      var x = c.getContext('2d');
      x.fillStyle='#fff'; x.fillRect(0,0,460,100);
      x.font="italic 54px 'Brush Script MT',cursive"; x.fillStyle='#1e40af';
      x.fillText(name, 10, 74);
      signatureData = c.toDataURL('image/png');
    }

    var btn = document.getElementById('signSubmitBtn');
    btn.disabled = true; btn.textContent = 'Signing...';

    fetch('/api/contracts/' + contractId + '/sign', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ party: currentParty, signatureData: signatureData })
    })
    .then(function(r){ return r.json(); })
    .then(function(data) {
      if(data.error){ alert('Error: ' + data.error); btn.disabled=false; btn.textContent='Sign Document'; return; }
      closeSignPanel();
      if(data.fullyExecuted) {
        window.parent.postMessage({ type: 'FULLY_EXECUTED' }, '*');
      }
      location.reload();
    })
    .catch(function(err){ alert('Signing failed. Please try again.'); btn.disabled=false; btn.textContent='Sign Document'; });
  };

  document.addEventListener('DOMContentLoaded', init);
  if(document.readyState !== 'loading') init();
})();
</script>` : ""}
</body>
</html>`;

    if (req.query.download === "1") {
      const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "domcontentloaded" });
        const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" } });
        const filename = `${contract.contr_ref_no || id}-contract.pdf`;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFilename(filename)}"`);
        res.send(Buffer.from(pdf));
      } finally {
        await browser.close();
      }
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(html);
  } catch (error) {
    handleError(res, error, "Failed to generate contract preview");
  }
});

// ── Import Contract Document (DOCX / PDF → AI clause extraction) ────────────────
router.post("/api/contracts/:id/import-document", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const mime = req.file.mimetype;
    const buf = req.file.buffer;
    let extractedText = "";

    if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || mime === "application/msword") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: buf });
      extractedText = result.value;
    } else if (mime === "application/pdf") {
      const { createRequire } = await import("module");
      const _require = createRequire(import.meta.url);
      const pdfParse: (buf: Buffer) => Promise<{ text: string; numpages: number }> =
        _require("pdf-parse/lib/pdf-parse.js");
      const data = await pdfParse(buf);
      extractedText = data.text;
    } else {
      return res.status(400).json({ error: "Only PDF and DOCX files are supported" });
    }

    if (!extractedText.trim()) return res.status(422).json({ error: "Could not extract text from document" });

    const { getAIClient, getAIModelName } = await import("../../services/ai-client");
    const client = await getAIClient();
    const model = await getAIModelName();

    const prompt = `You are a contract analysis expert. Analyze the following contract document text and extract all distinct clauses.

For each clause, identify:
1. A short, clear title (3-6 words)
2. The full clause content as clean HTML (use <p>, <ul>, <li>, <strong>, <em> tags)

Return a JSON array of clause objects. Each object must have:
- "title": string (the clause heading)
- "content": string (the clause body as HTML)

Rules:
- Extract only substantive clauses (ignore cover pages, signatures, headers)
- Each clause should be a distinct legal provision
- Preserve the original intent and wording
- Return 5-25 clauses depending on document length

Document text:
---
${extractedText.slice(0, 12000)}
---

Return ONLY a valid JSON array, no other text.`;

    const completion = await (client as any).chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 4000,
    });

    const raw = completion.choices?.[0]?.message?.content || "[]";
    const jsonStr = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    let clauses: any[] = [];
    try { clauses = JSON.parse(jsonStr); } catch { clauses = []; }

    res.json({ clauses: clauses.map((c: any, i: number) => ({
      title: c.title || `Clause ${i + 1}`,
      content: c.content || "",
    })) });
  } catch (error: any) {
    if (error?.code === "AI_NOT_CONFIGURED") return res.status(503).json({ error: "AI not configured" });
    handleError(res, error, "Failed to import document");
  }
});

// ── Publish Contract to Vendors ────────────────────────────────────────────────
router.patch("/api/contracts/:id/publish", async (req, res) => {
  try {
    const tenantPool = getPool();
    const user = (req as any).user;
    const { id } = req.params;

    // 1. Fetch contract header
    const { rows: hdrRows } = await tenantPool.query(
      `SELECT id, title, status, appr_status, curr_appr_comments, contr_ref_no FROM dbo.cm_header WHERE id = $1`, [id]
    );
    if (!hdrRows.length) return res.status(404).json({ error: "Contract not found" });
    const hdr = hdrRows[0];

    // 2. Fetch all approvers for this contract
    const { rows: approvers } = await tenantPool.query(
      `SELECT id, teamtype, review_required, accepted_contract FROM dbo.cm_approvers WHERE contractrefno = $1`, [id]
    );

    // 3. Validation — at least one approver (review team member)
    if (!approvers.length) {
      return res.status(400).json({ error: "Please add at least one review team member" });
    }

    // 4. Fetch suppliers for this contract
    const { rows: suppliers } = await tenantPool.query(
      `SELECT id, supplier_name, supplier_contact_email FROM dbo.cm_supplier_dtls WHERE contractrefno = $1 ORDER BY id ASC LIMIT 1`, [id]
    );

    // 5. Validation — at least one supplier
    if (!suppliers.length) {
      return res.status(400).json({ error: "Please add at least one supplier" });
    }
    const supplierName = suppliers[0].supplier_name;

    // 6. Validation — all Review Team members with review_required=Y must have accepted
    const notAccepted = approvers.filter((a: any) =>
      a.teamtype === "Review Team" &&
      a.review_required === "Y" &&
      (a.accepted_contract == null || a.accepted_contract === "N")
    );
    if (notAccepted.length > 0) {
      return res.status(400).json({
        error: "All members of the review team have not accepted this version of the contract. Please submit for review and get the review team to accept before proceeding."
      });
    }

    // 7. Determine appr_status/comment cleanup
    const newApprStatus    = hdr.appr_status === "Rejected" ? null : hdr.appr_status;
    const newApprComments  = (hdr.appr_status === "Rejected" || hdr.appr_status === "More Info Required")
      ? null : hdr.curr_appr_comments;

    // 8. Generate contr_ref_no if not already set
    const contrRefNo = hdr.contr_ref_no && hdr.contr_ref_no !== ""
      ? hdr.contr_ref_no
      : `CM-${id}`;

    const modifiedBy = user?.email || user?.name || "system";

    // 9. Update contract header — status → 'Under Negotiation'
    const { rows: updated } = await tenantPool.query(`
      UPDATE dbo.cm_header SET
        status = 'Under Negotiation',
        supplier_name = $2,
        contr_ref_no = $3,
        rev_flag = 'N',
        rev_by = NULL,
        rev_date = NULL,
        appr_status = $4,
        curr_appr_comments = $5,
        last_modified_by = $6,
        last_modified_date = NOW()
      WHERE id = $1
      RETURNING id, status
    `, [id, supplierName, contrRefNo, newApprStatus, newApprComments, modifiedBy]);

    // 10. Update contract terms status → 'Published'
    await tenantPool.query(
      `UPDATE dbo.cm_contracts_terms SET status = 'Published', last_modified_date = NOW() WHERE contractrefno = $1`,
      [id]
    );

    res.json(updated[0]);

    audit(req, id, "UPDATE", `Contract published to suppliers and is under negotiation: ${id}`);

    // Notify supplier by email (non-blocking)
    (async () => {
      try {
        const { emailService } = await import("../../services/emailService");
        const supplierEmail = suppliers[0]?.supplier_contact_email?.trim();
        if (supplierEmail) {
          await emailService.sendTemplatedEmail(
            "PUBLISH_CONTRACT_SUPPLIER",
            supplierEmail,
            {
              supplierName: suppliers[0]?.supplier_name || supplierEmail,
              taskTitle: hdr.title || String(id),
              submittedBy: modifiedBy,
              contractId: hdr.contr_ref_no || String(id),
            }
          );
        }
      } catch (e) {
        console.error("[contracts] Failed to send publish notification:", e);
      }
    })();
  } catch (error) {
    handleError(res, error, "Failed to publish contract");
  }
});

// ── Version History ────────────────────────────────────────────────────────────
router.get("/api/contracts/:id/versions", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;
    const { rows: current } = await tenantPool.query(
      `SELECT parent_id FROM dbo.cm_header WHERE id = $1`, [id]
    );
    if (!current.length) return res.status(404).json({ error: "Contract not found" });
    // root_id: if this contract IS the root (parent_id IS NULL), root = itself
    //          if this contract IS a child, root = its parent_id
    const rootId = current[0].parent_id ?? parseInt(id);
    const { rows } = await tenantPool.query(
      `SELECT h.id, h.title, h.contr_ref_no, h.status, h.version,
              h.start_date, h.end_date, h.currency, h.contract_amount,
              h.created_by, h.creation_date,
              s.supplier_name
       FROM dbo.cm_header h
       LEFT JOIN dbo.cm_supplier_dtls s ON s.contractrefno = h.id
       WHERE (h.id = $1 OR h.parent_id = $1) AND h.id != $2
       ORDER BY h.version DESC`,
      [rootId, id]
    );
    res.json(rows);
  } catch (error) { handleError(res, error, "Failed to fetch version history"); }
});

// ── Contract Audit Logs ────────────────────────────────────────────────────────
router.get("/api/contracts/:id/audit-logs", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const countResult = await tenantPool.query(
      `SELECT COUNT(*) as total FROM dbo.am_audit_log WHERE audit_key = $1`,
      [id]
    );
    const result = await tenantPool.query(
      `SELECT id, audit_key, audit_action, audit_date, audit_message, full_name, user_id, module
       FROM dbo.am_audit_log
       WHERE audit_key = $1
       ORDER BY audit_date DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );
    const total = parseInt(countResult.rows[0].total);
    res.json({
      records: result.rows.map(normalizeAuditVendorTerminology),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) { handleError(res, error, "Failed to fetch audit logs"); }
});

// ── Get Single Contract (must be AFTER /list and /list/stats) ─────────────────
router.get("/api/contracts/:id", async (req, res) => {
  try {
    const tenantPool = getPool();
    const sessionUser = (req as any).user;
    const { id } = req.params;
    const { rows } = await tenantPool.query(`
      SELECT h.id, h.title, h.description, h.status, h.type, h.version, h.contr_ref_no,
             h.owner, h.owner_name, h.requestor, h.requestor_name, h.department, h.department_name,
             h.start_date, h.end_date, h.currency, h.contract_amount, h.is_renewable,
             h.project_name, h.project_ref_no, h.creation_date, h.created_by,
             h.approvers_list, h.appr_status, h.curr_appr_comments,
             u.email_id AS requestor_email
      FROM dbo.cm_header h
      LEFT JOIN dbo.um_user_dtls u ON u.id::text = h.requestor
      WHERE h.id = $1
    `, [id]);
    if (!rows.length) return res.status(404).json({ error: "Contract not found" });

    const contract = rows[0];
    const ownerLower = (contract.owner || "").toLowerCase();
    const sessionUserName = (sessionUser?.userName || sessionUser?.email || "").toLowerCase();
    contract.is_owner = !!ownerLower && !!sessionUserName && ownerLower === sessionUserName;

    // Compute is_approver by checking the active workflow task assignee_.
    // approvers_list stores display names (not usernames), so we query act_ru_task directly
    // where assignee_ holds the actual username/email (USER type) or role_name (ROLE type).
    const sessionUserEmail = (sessionUser?.email || "").toLowerCase();
    contract.is_approver = false;
    if (contract.status === "Pending Approval") {
      try {
        const { rows: taskRows } = await getPool().query(
          `SELECT t.assignee_ FROM dbo.act_ru_task t
           JOIN dbo.wf_step_instance si ON t.id_ = si.task_id
           WHERE si.ref_number = $1 AND si.status = 'Ready' AND t.suspension_state_ = 1
           LIMIT 1`,
          [id]
        );
        if (taskRows.length > 0) {
          const assignee = (taskRows[0].assignee_ || "").trim();
          const assigneeUpper = assignee.toUpperCase();
          if (assigneeUpper.startsWith("ROLE_")) {
            // Role-based: look up session user's roles from tenant DB
            const { rows: roleRows } = await tenantPool.query(
              `SELECT r.role_name FROM dbo.um_role_dtls r
               JOIN dbo.um_user_roles_map_dtls urm ON r.id = urm.role_id
               JOIN dbo.um_user_dtls u ON u.id = urm.user_id
               WHERE u.user_name = $1 OR u.email_id = $1`,
              [sessionUser?.userName || sessionUser?.email || ""]
            );
            const userRoles = roleRows.map((r: any) => r.role_name.toUpperCase());
            contract.is_approver = userRoles.includes(assigneeUpper);
          } else {
            // User-based: compare username/email directly
            const assigneeLower = assignee.toLowerCase();
            contract.is_approver = assigneeLower === sessionUserName || assigneeLower === sessionUserEmail;
          }
        }
      } catch {
        // ignore lookup failure — is_approver stays false
      }
    }

    res.json(contract);
  } catch (error) {
    handleError(res, error, "Failed to fetch contract");
  }
});

// ── Delivery Schedules ────────────────────────────────────────────────────────
router.get("/api/contracts/:id/delivery-schedules", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;
    const { rows } = await tenantPool.query(
      `SELECT * FROM dbo.cm_delivery_schedules WHERE parent_id = $1 ORDER BY id`,
      [id]
    );
    res.json(rows);
  } catch (error) { handleError(res, error, "Failed to fetch delivery schedules"); }
});

router.post("/api/contracts/:id/delivery-schedules", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;
    const { deliverable_name, details, schedule_type, schedule_date, tentative_date, elasped_days, amt_milestone, pcnt_milestone, schedule_frequency } = req.body;
    const newId = Math.floor(Math.random() * 900000000) + 100000000;
    const { rows } = await tenantPool.query(
      `INSERT INTO dbo.cm_delivery_schedules (id, parent_id, deliverable_name, details, schedule_type, schedule_date, tentative_date, elasped_days, amt_milestone, pcnt_milestone, schedule_frequency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [newId, id, deliverable_name || null, details || null, schedule_type || null,
       schedule_date || null, tentative_date || null, elasped_days || null,
       amt_milestone || null, pcnt_milestone || null, schedule_frequency || null]
    );
    res.json(rows[0]);
  } catch (error) { handleError(res, error, "Failed to create delivery schedule"); }
});

router.put("/api/contracts/:id/delivery-schedules/:schedId", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { schedId } = req.params;
    const { deliverable_name, details, schedule_type, schedule_date, tentative_date, elasped_days, amt_milestone, pcnt_milestone, schedule_frequency } = req.body;
    const { rows } = await tenantPool.query(
      `UPDATE dbo.cm_delivery_schedules
       SET deliverable_name=$1, details=$2, schedule_type=$3, schedule_date=$4,
           tentative_date=$5, elasped_days=$6, amt_milestone=$7, pcnt_milestone=$8, schedule_frequency=$9
       WHERE id=$10 RETURNING *`,
      [deliverable_name || null, details || null, schedule_type || null,
       schedule_date || null, tentative_date || null, elasped_days || null,
       amt_milestone || null, pcnt_milestone || null, schedule_frequency || null, schedId]
    );
    res.json(rows[0]);
  } catch (error) { handleError(res, error, "Failed to update delivery schedule"); }
});

router.delete("/api/contracts/:id/delivery-schedules/:schedId", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { schedId } = req.params;
    await tenantPool.query(`DELETE FROM dbo.cm_delivery_schedules WHERE id = $1`, [schedId]);
    res.json({ success: true });
  } catch (error) { handleError(res, error, "Failed to delete delivery schedule"); }
});

// ── Payment Terms ─────────────────────────────────────────────────────────────
router.get("/api/contracts/:id/payment-terms", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;
    const { rows } = await tenantPool.query(
      `SELECT * FROM dbo.cm_payment_terms WHERE parent_id = $1 ORDER BY id`,
      [id]
    );
    res.json(rows);
  } catch (error) { handleError(res, error, "Failed to fetch payment terms"); }
});

router.post("/api/contracts/:id/payment-terms", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;
    const { name, payment_type, period, amt_milestone, pcnt_milestone } = req.body;
    const newId = Math.floor(Math.random() * 900000000) + 100000000;
    const { rows } = await tenantPool.query(
      `INSERT INTO dbo.cm_payment_terms (id, parent_id, name, payment_type, period, amt_milestone, pcnt_milestone)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [newId, id, name || null, payment_type || null, period || null, amt_milestone || null, pcnt_milestone || null]
    );
    res.json(rows[0]);
    audit(req, id, "CREATE", `Payment term created: ${rows[0]?.name || newId}`);
  } catch (error) { handleError(res, error, "Failed to create payment term"); }
});

router.put("/api/contracts/:id/payment-terms/:termId", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id, termId } = req.params;
    const { name, payment_type, period, amt_milestone, pcnt_milestone } = req.body;
    const { rows } = await tenantPool.query(
      `UPDATE dbo.cm_payment_terms
       SET name=$1, payment_type=$2, period=$3, amt_milestone=$4, pcnt_milestone=$5
       WHERE id=$6 RETURNING *`,
      [name || null, payment_type || null, period || null, amt_milestone || null, pcnt_milestone || null, termId]
    );
    res.json(rows[0]);
    audit(req, id, "UPDATE", `Payment term updated: ${termId}`);
  } catch (error) { handleError(res, error, "Failed to update payment term"); }
});

router.delete("/api/contracts/:id/payment-terms/:termId", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id, termId } = req.params;
    await tenantPool.query(`DELETE FROM dbo.cm_payment_terms WHERE id = $1`, [termId]);
    res.json({ success: true });
    audit(req, id, "DELETE", `Payment term deleted: ${termId}`);
  } catch (error) { handleError(res, error, "Failed to delete payment term"); }
});

// ── Clause Comments (cm_contracts_terms_hst, action='Comment') ─────────────────
// attribute_3 = selected text excerpt
// attribute_4 = UUID anchor (links to editor <span data-comment-id>)
// attribute_5 = comment body text
// attribute_2 = resolved flag: 'Y' | null

router.get("/api/contracts/:id/comments", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;
    const { rows } = await tenantPool.query(
      `SELECT h.*
       FROM dbo.cm_contracts_terms_hst h
       INNER JOIN dbo.cm_contracts_terms t ON t.id = h.contr_term_id
       WHERE t.contractrefno = $1 AND h.action = 'Comment'
       ORDER BY h.action_date ASC`,
      [id]
    );
    res.json(rows);
  } catch (error) { handleError(res, error, "Failed to fetch comments"); }
});

router.post("/api/contracts/:id/clauses/:clauseId/comments", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { clauseId } = req.params;
    const { comment_uuid, selected_text, comment_text, author_name, author_email } = req.body;
    const idRes = await tenantPool.query(
      `SELECT COALESCE(MAX(id), 380700000) + 1 AS next_id FROM dbo.cm_contracts_terms_hst`
    );
    const newId = idRes.rows[0].next_id;
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2,'0')}-${String(today.getMonth()+1).padStart(2,'0')}-${today.getFullYear()}`;
    const { rows } = await tenantPool.query(
      `INSERT INTO dbo.cm_contracts_terms_hst
         (id, contr_term_id, action, action_date, action_taken_by, action_taken_by_name,
          attribute_1, attribute_2, attribute_3, attribute_4, attribute_5)
       VALUES ($1,$2,'Comment',NOW(),$3,$4,$5,NULL,$6,$7,$8) RETURNING *`,
      [newId, clauseId, author_email || "", author_name || "", dateStr,
       selected_text || "", comment_uuid || "", comment_text || ""]
    );
    res.json(rows[0]);
    audit(req, req.params.id, "CREATE", `Comment added on clause ${clauseId}`);
  } catch (error) { handleError(res, error, "Failed to add comment"); }
});

router.patch("/api/contracts/:id/clauses/:clauseId/comments/:commentId/resolve", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { clauseId, commentId } = req.params;
    const sessionUser = (req as any).user;
    // Fetch comment to get the anchor UUID
    const { rows: [comment] } = await tenantPool.query(
      `SELECT * FROM dbo.cm_contracts_terms_hst WHERE id = $1`, [commentId]
    );
    if (!comment) return res.status(404).json({ error: "Comment not found" });
    // Mark as resolved
    await tenantPool.query(
      `UPDATE dbo.cm_contracts_terms_hst SET attribute_2 = 'Y' WHERE id = $1`, [commentId]
    );
    // Strip the comment span from the clause HTML so the highlight disappears
    const anchorUuid = comment.attribute_4;
    if (anchorUuid) {
      const { rows: [clause] } = await tenantPool.query(
        `SELECT term_details FROM dbo.cm_contracts_terms WHERE id = $1`, [clauseId]
      );
      if (clause?.term_details) {
        // Remove <span data-comment-id="uuid"...>text</span> wrapper, keep inner text
        let html: string = clause.term_details;
        // Non-greedy match of the span with the specific comment id
        const open = new RegExp(`<span[^>]*data-comment-id="${anchorUuid}"[^>]*>`, 'g');
        // We do a two-pass: replace opening tag + walk to matching </span>
        html = html.replace(open, '\x00CMSTART\x00');
        // Now remove the marker + the first </span> after it (keep content between)
        html = html.replace(/\x00CMSTART\x00([\s\S]*?)<\/span>/g, '$1');
        await tenantPool.query(
          `UPDATE dbo.cm_contracts_terms SET term_details = $1 WHERE id = $2`,
          [html, clauseId]
        );
      }
    }
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", `Comment ${commentId} resolved on clause ${clauseId}`);
  } catch (error) { handleError(res, error, "Failed to resolve comment"); }
});

export { router as contractsController };

