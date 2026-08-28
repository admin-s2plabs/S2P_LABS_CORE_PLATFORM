import { Router } from "express";
import * as service from "./tat.service";
import { logAudit } from "../administration/administration.service";
import { resolveRequestUser } from "../_shared/auth";

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

// ── GET /api/tat/workflows-summary ───────────────────────────────────────────
router.get("/api/tat/workflows-summary", async (req, res) => {
  try {
    const result = await service.getWorkflowsSummary();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tat/rules ────────────────────────────────────────────────────────
router.get("/api/tat/rules", async (req, res) => {
  try {
    const result = await service.getTatRules();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/tat/rules ────────────────────────────────────────────────────────
router.put("/api/tat/rules", async (req, res) => {
  const { module_key, rules } = req.body;
  const user = resolveRequestUser(req);
  const userId = user?.id || "system";
  try {
    await service.saveTatRules(module_key, rules, userId);
    res.json({ success: true });
    audit(req, module_key, "UPDATE", `TAT rules updated for module ${module_key}`, "TAT");
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tat/overview ─────────────────────────────────────────────────────
router.get("/api/tat/overview", async (req, res) => {
  try {
    const result = await service.getOverview();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tat/lifecycle ────────────────────────────────────────────────────
router.get("/api/tat/lifecycle/:entityType/:entityId", async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const logs = await service.getLifecycleLogs(entityType, entityId);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tat/lifecycle-ids/:entityType ────────────────────────────────────
// Pulls IDs from real transaction tables (not am_tat_logs which may be empty)
router.get("/api/tat/lifecycle-ids/:entityType", async (req, res) => {
  try {
    const ids = await service.getLifecycleIds(req.params.entityType);
    res.json(ids);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tat/alerts ───────────────────────────────────────────────────────
// Optional ?module= filter (vendor|pr|bid|po|dn|grn|invoice)
router.get("/api/tat/alerts", async (req, res) => {
  try {
    const data = await service.getAlerts(req.query.module as string | undefined);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tat/missed-alerts ────────────────────────────────────────────────
router.get("/api/tat/missed-alerts", async (req, res) => {
  try {
    const data = await service.getMissedAlerts(req.query.module as string | undefined);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/tat/missed-alerts/:id/remark ────────────────────────────────────
router.put("/api/tat/missed-alerts/:id/remark", async (req, res) => {
  const { id } = req.params;
  const { remark } = req.body;
  const user = resolveRequestUser(req);
  const userId = user?.email || "system";
  try {
    await service.updateMissedAlertRemark(id, remark, userId);
    res.json({ success: true });
    audit(req, id, "UPDATE", "TAT missed-alert remark updated", "TAT");
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tat/stallers ─────────────────────────────────────────────────────
router.get("/api/tat/stallers", async (req, res) => {
  try {
    const data = await service.getStallers(req.query.module as string | undefined);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tat/ignored ──────────────────────────────────────────────────────
router.get("/api/tat/ignored", async (req, res) => {
  try {
    const data = await service.getIgnored(req.query.module as string | undefined);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tat/ignored ─────────────────────────────────────────────────────
router.post("/api/tat/ignored", async (req, res) => {
  const { entity_type, entity_id, stage_name, reason } = req.body;
  const user = resolveRequestUser(req);
  const userId = user?.email || "system";
  try {
    await service.addIgnored({ entityType: entity_type, entityId: entity_id, stageName: stage_name, reason, userId });
    res.json({ success: true });
    audit(req, entity_id, "CREATE", `TAT ignored: ${entity_type} — ${stage_name}`, "TAT");
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tat/escalate ────────────────────────────────────────────────────
router.post("/api/tat/escalate", async (req, res) => {
  const {
    tat_log_id, entity_type, entity_id, stage_name,
    escalated_from_user_id, escalated_from_name,
    escalated_to_user_id, escalated_to_name,
    cc_user_ids, cc_names, remark, is_supplier_escalation,
  } = req.body;
  const user = resolveRequestUser(req);
  const userId = user?.email || "system";
  try {
    await service.addEscalation({
      tatLogId: tat_log_id, entityType: entity_type, entityId: entity_id, stageName: stage_name,
      escalatedFromUserId: escalated_from_user_id, escalatedFromName: escalated_from_name,
      escalatedToUserId: escalated_to_user_id, escalatedToName: escalated_to_name,
      ccUserIds: cc_user_ids, ccNames: cc_names, remark, userId,
      isSupplierEscalation: is_supplier_escalation,
    });
    res.json({ success: true });
    audit(req, entity_id, "CREATE", `TAT escalated: ${entity_type} — ${stage_name}`, "TAT");
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tat/audit-logs ───────────────────────────────────────────────────
router.get("/api/tat/audit-logs", async (req, res) => {
  try {
    const data = await service.getAuditLogs();
    res.json(data);
  } catch (err: any) {
    res.json([]);
  }
});

export const tatController = router;
