import { Router } from "express";
import * as service from "./integrations.service";
import { logAudit } from "../administration/administration.service";
import { requireAuth } from "../_shared";

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
    userId: user?.user_name || user?.email_id || "system",
    module,
  }).catch((e: any) => console.error("[Audit] Failed:", e));
}

router.get("/api/admin/masterdata-entities", async (req, res) => {
  try {
    const entities = await service.getMasterDataEntities();
    res.json(entities);
  } catch (error) {
    handleError(res, error, "Failed to fetch master data entities");
  }
});

router.post("/api/admin/masterdata-entities", async (req, res) => {
  try {
    const user = (req as any).user;
    const entity = await service.createMasterDataEntity({
      ...req.body,
      created_by: user?.name || "System",
    });
    res.status(201).json(entity);
    audit(req, `ENTITY_${entity.business_entity}`, "CREATE", `Created new entity: ${entity.business_entity}`, "Integrations");
  } catch (error) {
    handleError(res, error, "Failed to create entity");
  }
});

router.post("/api/admin/masterdata-entities/:id/sync", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const user = (req as any).user;
    const entity = await service.syncMasterDataEntity(id, user?.name || "System");
    res.json(entity);
    audit(req, `MASTERDATA_SYNC_${id}`, "SYNC", `Triggered sync for entity ID ${id}`, "Integrations");
  } catch (error) {
    handleError(res, error, "Failed to sync master data entity");
  }
});

router.get("/api/admin/erp-connection", async (req, res) => {
  try {
    const connection = await service.getErpConnection();
    res.json(connection);
  } catch (error) {
    handleError(res, error, "Failed to fetch ERP connection");
  }
});

router.put("/api/admin/erp-connection", async (req, res) => {
  try {
    const user = (req as any).user;
    const connection = await service.saveErpConnection({ ...req.body, modified_by: user?.name || "System", created_by: user?.name || "System" });
    res.json(connection);
    audit(req, "ERP_CONNECTION", "UPDATE", `Saved ERP connection: ${req.body.erp_name}`, "Integrations");
  } catch (error) {
    handleError(res, error, "Failed to save ERP connection");
  }
});

router.delete("/api/admin/erp-connection", async (req, res) => {
  try {
    await service.deleteErpConnection();
    res.json({ success: true });
    audit(req, "ERP_CONNECTION", "DELETE", "Deleted ERP connection", "Integrations");
  } catch (error) {
    handleError(res, error, "Failed to delete ERP connection");
  }
});

router.post("/api/admin/erp-connection/test", async (req, res) => {
  try {
    const result = await service.testErpConnection();
    res.json(result);
    audit(req, "ERP_CONNECTION_TEST", "TEST", `Tested ERP connection: ${result.status}`, "Integrations");
  } catch (error) {
    handleError(res, error, "Failed to test ERP connection");
  }
});

router.post("/api/admin/erp-connection/test-presave", async (req, res) => {
  try {
    const { api_url, auth_type, username, password, client_id, client_secret, tenant_id, scope } = req.body;
    if (!api_url) {
      return res.status(400).json({ status: "failed", testResult: "API URL is required to test the connection." });
    }
    const result = await service.testErpConnectionPreSave({
      api_url, auth_type, username, password, client_id, client_secret, tenant_id, scope,
    });
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to test connection");
  }
});

router.get("/api/admin/masterdata-entities/:entityName", async (req, res) => {
  try {
    const entity = await service.getMasterDataEntityByName(req.params.entityName);
    const stats = await service.getEntityTransactionStats(req.params.entityName);
    res.json({ entity, stats });
  } catch (error) {
    handleError(res, error, "Failed to fetch entity details");
  }
});

router.get("/api/admin/masterdata-entities/:entityName/transactions", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 25;
    const result = await service.getEntityTransactions(req.params.entityName, page, limit);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch entity transactions");
  }
});

router.get("/api/admin/entity-transactions/:id", async (req, res) => {
  try {
    const txn = await service.getEntityTransactionById(parseInt(req.params.id));
    res.json(txn);
  } catch (error) {
    handleError(res, error, "Failed to fetch transaction details");
  }
});

router.get("/api/admin/masterdata-entities/:entityName/sync-runs", async (req, res) => {
  try {
    const runs = await service.getEntitySyncRuns(req.params.entityName);
    res.json(runs);
  } catch (error) {
    handleError(res, error, "Failed to fetch sync runs");
  }
});

router.get("/api/admin/masterdata-entities/:entityName/records-by-run", async (req, res) => {
  try {
    const runId = parseInt(req.query.runId as string);
    if (!runId) return res.status(400).json({ message: "runId query parameter required" });
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const statusFilter = req.query.status as string | undefined;
    const result = await service.getEntityTransactionsByRunId(runId, page, limit, statusFilter);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch records by run");
  }
});

router.get("/api/admin/masterdata-records/:id", async (req, res) => {
  try {
    const record = await service.getEntityRecordById(parseInt(req.params.id));
    if (!record) return res.status(404).json({ message: "Record not found" });
    res.json(record);
  } catch (error) {
    handleError(res, error, "Failed to fetch record details");
  }
});

router.get("/api/admin/table-columns", async (req, res) => {
  try {
    const tableName = req.query.table as string;
    if (!tableName) return res.status(400).json({ error: "table query parameter is required" });
    const columns = await service.getTableColumns(tableName);
    res.json(columns);
  } catch (error) {
    handleError(res, error, "Failed to fetch table columns");
  }
});

router.get("/api/admin/entity-configs/:entityKey", async (req, res) => {
  try {
    const entity = await service.getEntityByKey(req.params.entityKey);
    res.json(entity);
  } catch (error) {
    handleError(res, error, "Failed to fetch entity config");
  }
});

router.put("/api/admin/entity-configs/:entityKey", async (req, res) => {
  try {
    const user = (req as any).user;
    const result = await service.updateEntityDetails(req.params.entityKey, {
      ...req.body,
      modified_by: user?.name || "System",
    });
    res.json(result);
    audit(req, `ENTITY_${req.params.entityKey}`, "UPDATE", `Updated entity details for ${req.params.entityKey}`, "Integrations");
  } catch (error) {
    handleError(res, error, "Failed to update entity details");
  }
});

router.put("/api/admin/entity-configs/:entityKey/mapping", async (req, res) => {
  try {
    const user = (req as any).user;
    const result = await service.updateEntityMapping(req.params.entityKey, {
      ...req.body,
      modified_by: user?.name || "System",
    });
    res.json(result);
    audit(req, `ENTITY_MAPPING_${req.params.entityKey}`, "UPDATE", `Updated field mapping for ${req.params.entityKey}`, "Integrations");
  } catch (error) {
    handleError(res, error, "Failed to update entity mapping");
  }
});

router.post("/api/admin/entity-configs/:entityKey/erp-metadata", async (req, res) => {
  try {
    const erpEndpoint = req.body?.erp_endpoint as string | undefined;
    const result = await service.fetchErpMetadata(req.params.entityKey, erpEndpoint);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch ERP metadata");
  }
});

router.post("/api/admin/entity-configs/:entityKey/sync", async (req, res) => {
  try {
    const user = (req as any).user;
    const result = await service.syncEntity(req.params.entityKey, user?.name || "System");
    res.json(result);
    audit(req, `ENTITY_SYNC_${req.params.entityKey}`, "SYNC", `Triggered sync for entity ${req.params.entityKey}`, "Integrations");
  } catch (error) {
    handleError(res, error, "Failed to sync entity");
  }
});

router.get("/api/admin/entity-configs/:entityKey/sync-progress", async (req, res) => {
  try {
    const result = await service.getSyncProgress(req.params.entityKey);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to get sync progress");
  }
});

router.get("/api/admin/custom-sync-handlers", async (_req, res) => {
  try {
    const handlers = await service.getRegisteredSyncHandlers();
    res.json(handlers);
  } catch (error) {
    handleError(res, error, "Failed to list custom sync handlers");
  }
});

router.get("/api/admin/interface-logs", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 25;
    const result = await service.getInterfaceLogs({
      page,
      limit,
      search: req.query.search as string,
      transactionType: req.query.transactionType as string,
      status: req.query.status as string,
      businessEntity: req.query.businessEntity as string,
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
    });
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch interface logs");
  }
});

router.get("/api/admin/interface-logs/stats", async (_req, res) => {
  try {
    const stats = await service.getInterfaceLogStats();
    res.json(stats);
  } catch (error) {
    handleError(res, error, "Failed to fetch interface log stats");
  }
});

router.get("/api/admin/interface-logs/filters", async (_req, res) => {
  try {
    const options = await service.getInterfaceLogFilterOptions();
    res.json(options);
  } catch (error) {
    handleError(res, error, "Failed to fetch filter options");
  }
});

router.get("/api/admin/interface-logs/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const log = await service.getInterfaceLogById(id);
    res.json(log);
  } catch (error) {
    handleError(res, error, "Failed to fetch interface log");
  }
});

router.get("/api/admin/api-keys", requireAuth, async (_req, res) => {
  try {
    const keys = await service.getApiKeys();
    res.json(keys);
  } catch (error) {
    handleError(res, error, "Failed to fetch API keys");
  }
});

router.post("/api/admin/api-keys", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const key = await service.createApiKey({
      ...req.body,
      created_by: user?.name || "System",
    });
    res.status(201).json(key);
    audit(req, `APIKEY_${key.id}`, "CREATE", `Created API key: ${req.body.key_name}`, "Integrations");
  } catch (error) {
    handleError(res, error, "Failed to create API key");
  }
});

router.patch("/api/admin/api-keys/:id/revoke", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const key = await service.revokeApiKey(parseInt(req.params.id), user?.name || "System");
    res.json(key);
    audit(req, `APIKEY_${req.params.id}`, "UPDATE", `Revoked API key: ${key.key_name}`, "Integrations");
  } catch (error) {
    handleError(res, error, "Failed to revoke API key");
  }
});

router.delete("/api/admin/api-keys/:id", requireAuth, async (req, res) => {
  try {
    await service.deleteApiKey(parseInt(req.params.id));
    res.json({ success: true });
    audit(req, `APIKEY_${req.params.id}`, "DELETE", `Deleted API key ID: ${req.params.id}`, "Integrations");
  } catch (error) {
    handleError(res, error, "Failed to delete API key");
  }
});

export const integrationsController = router;
