import * as repo from "./integrations.repository";
import { isUrlSafe } from "../_shared/ssrf-protection";
import { getHook } from "./hooks";
import { getSyncHandler } from "./custom-sync";

export async function getMasterDataEntities() {
  return repo.getMasterDataEntities();
}

export async function getMasterDataEntityByName(businessEntity: string) {
  const entity = await repo.getMasterDataEntityByKey(businessEntity);
  if (!entity) throw { status: 404, message: "Entity not found" };
  return entity;
}

export async function syncMasterDataEntity(id: number, modifiedBy: string) {
  const entity = await repo.getMasterDataEntityById(id);
  if (!entity) throw { status: 404, message: "Entity not found" };
  await repo.updateMasterDataEntityStatus(id, "Syncing", modifiedBy);
  setTimeout(async () => {
    try {
      await repo.updateMasterDataEntityStatus(id, "Executed", modifiedBy);
    } catch (e) {
      console.error("[MasterData] Sync simulation failed:", e);
    }
  }, 3000);
  return { ...entity, status: "Syncing" };
}

export async function createMasterDataEntity(data: {
  business_entity: string;
  description?: string;
  target_table?: string;
  erp_endpoint?: string;
  created_by?: string;
}) {
  if (!data.business_entity?.trim()) {
    throw { status: 400, message: "Entity key is required" };
  }
  const entityKey = data.business_entity.trim().toUpperCase().replace(/\s+/g, '_');
  const existing = await repo.getMasterDataEntityByKey(entityKey);
  if (existing) {
    throw { status: 409, message: `Entity '${entityKey}' already exists` };
  }
  return repo.createMasterDataEntity({ ...data, business_entity: entityKey });
}

export async function getErpConnection() {
  return repo.getErpConnection();
}

export async function saveErpConnection(data: any) {
  return repo.saveErpConnection(data);
}

export async function deleteErpConnection() {
  return repo.deleteErpConnection();
}

async function performConnectionTest(conn: {
  api_url?: string;
  auth_type?: string;
  username?: string;
  password?: string;
  client_id?: string;
  client_secret?: string;
  tenant_id?: string;
  scope?: string;
}): Promise<{ status: "active" | "failed"; testResult: string; responseTime?: number }> {
  if (!conn.api_url || !conn.api_url.startsWith("http")) {
    return { status: "failed", testResult: "Invalid or missing API URL. URL must start with http:// or https://." };
  }

  const urlCheck = isUrlSafe(conn.api_url);
  if (!urlCheck.safe) {
    return { status: "failed", testResult: urlCheck.error || "API URL is blocked by security policy (internal/private addresses not allowed)." };
  }

  const startTime = Date.now();
  try {
    const headers: Record<string, string> = { "Accept": "application/json" };

    if (conn.auth_type === "basic" && conn.username) {
      headers["Authorization"] = "Basic " + Buffer.from(`${conn.username}:${conn.password || ""}`).toString("base64");
    }else if(conn.auth_type === "oauth2" && conn.client_id && conn.client_secret) {
      const oAuthResponse = await getAccessToken({...conn, token_url: conn.scope || ""});
      if (oAuthResponse.status !== 200) {
        return { status: "failed", testResult: `${oAuthResponse.testResult}` };
      }
      headers["Authorization"] = `Bearer ${oAuthResponse.accessToken}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(conn.api_url, {
      method: "GET",
      headers,
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    const responseTime = Date.now() - startTime;


    if (response.ok || response.status === 401 || response.status === 403) {
      const isAuth = response.status === 401 || response.status === 403 || response.status === 400 || response.status === 404;
      return {
        status: "active",
        testResult: isAuth
          ? `Server reachable (${responseTime}ms) — responded with ${response.status}. 
          Server is up but credentials may need verification. ${response.status}-${response.statusText}`
          : `Connection successful (${responseTime}ms) — HTTP ${response.status}`,
        responseTime,
      };
    }

    // If server is not reachable, return the error message
    return {
      status: "failed",
      testResult: `Server responded with HTTP ${response.status} ${response.statusText} (${responseTime}ms)`,
      responseTime,
    };
  } catch (err: any) {
    const responseTime = Date.now() - startTime;
    if (err.name === "AbortError") {
      return { status: "failed", testResult: `Connection timed out after 15 seconds`, responseTime };
    }
    const errMsg = err.cause?.code || err.code || err.message || "Unknown error";
    return { status: "failed", testResult: `Connection failed: ${errMsg}`, responseTime };
  }
}

export async function getAccessToken(conn: {
  api_url?: string;
  auth_type?: string;
  username?: string;
  password?: string;
  client_id?: string;
  client_secret?: string;
  tenant_id?: string;
  scope?: string;
  token_url: string;
}) {
  const tokenResponse = await fetch(conn.token_url!, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: conn.client_id!,
      client_secret: conn.client_secret!,
      resource: conn.api_url || "",
    }),
  });

  console.log("tokenResponse", tokenResponse);

  if (!tokenResponse.ok) {
    return {
      actualResponse: tokenResponse,
      status: tokenResponse.status,
      testResult: `OAuth authentication failed: ${tokenResponse.status}-${tokenResponse.statusText}`,
    };
  }

  const tokenData = await tokenResponse.text();
  const accessToken = JSON.parse(tokenData).access_token;

  return {
   status: tokenResponse.status,
   accessToken: accessToken,
   testResult: `OAuth authentication successful: ${tokenResponse.status}-${tokenResponse.statusText}`,
  }
}

export async function testErpConnection() {
  const conn = await repo.getErpConnection();
  if (!conn) throw { status: 404, message: "No ERP connection configured" };
  const result = await performConnectionTest(conn);
  await repo.updateErpConnectionStatus(result.status, result.testResult);
  return { ...result, last_tested_at: new Date() };
}

export async function testErpConnectionPreSave(data: {
  api_url?: string;
  auth_type?: string;
  username?: string;
  password?: string;
  client_id?: string;
  client_secret?: string;
  tenant_id?: string;
  scope?: string;
}) {
  return performConnectionTest(data);
}

export async function getEntityTransactions(businessEntity: string, page: number, limit: number) {
  return repo.getEntityTransactions(businessEntity, page, limit);
}

export async function getEntityTransactionById(id: number) {
  const txn = await repo.getEntityTransactionById(id);
  if (!txn) throw { status: 404, message: "Transaction not found" };
  return txn;
}

export async function getEntityTransactionStats(businessEntity: string) {
  return repo.getEntityTransactionStats(businessEntity);
}

export async function getEntitySyncRuns(businessEntity: string) {
  return repo.getEntitySyncRuns(businessEntity);
}

export async function getEntityTransactionsByRunId(runId: number, page: number, limit: number, statusFilter?: string) {
  return repo.getEntityTransactionsByRunId(runId, page, limit, statusFilter);
}

export async function getEntityRecordById(id: number) {
  return repo.getEntityRecordById(id);
}

export async function getTableColumns(tableName: string) {
  if (!tableName || !tableName.trim()) {
    throw { status: 400, message: "Table name is required" };
  }
  const entities = await repo.getMasterDataEntities();
  const allowedTables = entities
    .map((e: any) => e.target_table)
    .filter(Boolean)
    .map((t: string) => t.trim())
    .map((t: string) => t.toLowerCase());
  if (!allowedTables.includes(tableName.trim().toLowerCase())) {
    throw { status: 403, message: "Access denied. Table is not a configured entity target." };
  }
  const columns = await repo.getTableColumns(tableName.trim());
  if (columns.length === 0) {
    throw { status: 404, message: `No columns found for table '${tableName}'. Table may not exist.` };
  }
  return columns;
}

export async function getEntityByKey(businessEntity: string) {
  const entity = await repo.getMasterDataEntityByKey(businessEntity);
  if (!entity) throw { status: 404, message: "Entity not found" };
  return entity;
}

export async function updateEntityDetails(businessEntity: string, data: {
  description?: string;
  target_table?: string;
  erp_endpoint?: string;
  sync_mode?: string;
  custom_sync_handler?: string | null;
  modified_by?: string;
}) {
  if (data.sync_mode && !["standard", "custom"].includes(data.sync_mode)) {
    throw { status: 400, message: "sync_mode must be 'standard' or 'custom'" };
  }
  if (data.sync_mode === "custom") {
    if (!data.custom_sync_handler?.trim()) {
      throw { status: 400, message: "A custom sync handler name is required when sync mode is set to 'custom'." };
    }
    if (!getSyncHandler(data.custom_sync_handler.trim())) {
      throw { status: 400, message: `Custom sync handler '${data.custom_sync_handler}' is not registered. Register it in server/modules/integrations/custom-sync/ first.` };
    }
  }
  const result = await repo.updateEntityDetails(businessEntity, data);
  if (!result) throw { status: 404, message: "Entity not found" };
  return result;
}

export async function updateEntityMapping(businessEntity: string, data: {
  erp_endpoint?: string;
  field_mappings?: Record<string, string>;
  modified_by?: string;
}) {
  const result = await repo.updateEntityMapping(businessEntity, data);
  if (!result) throw { status: 404, message: "Entity not found" };
  return result;
}

export async function fetchErpMetadata(businessEntity: string, erpEndpointOverride?: string) {
  const entity = await repo.getMasterDataEntityByKey(businessEntity);
  if (!entity) throw { status: 404, message: "Entity not found" };
  const erpEndpoint = erpEndpointOverride?.trim() || entity.erp_endpoint?.trim();
  if (!erpEndpoint) {
    throw { status: 400, message: "No ERP endpoint configured for this entity. Enter an endpoint first." };
  }

  const connection = await repo.getErpConnection();
  if (!connection) {
    throw { status: 400, message: "No ERP connection configured. Set up an ERP connection in Settings first." };
  }
  if (!connection.api_url || !connection.api_url.startsWith("http")) {
    throw { status: 400, message: "ERP connection has no valid API URL. Update the connection settings." };
  }

  const metadataUrl = `${connection.api_url.replace(/\/$/, "")}/${erpEndpoint.replace(/^\//, "")}`;

  const urlCheck = isUrlSafe(metadataUrl);
  if (!urlCheck.safe) {
    throw { status: 400, message: `Invalid ERP URL: ${urlCheck.error}` };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const headers: Record<string, string> = { "Accept": "application/json" };

    if (connection.auth_type === "basic" && connection.username) {
      headers["Authorization"] = "Basic " + Buffer.from(`${connection.username}:${connection.password || ""}`).toString("base64");
    } else if (connection.auth_type === "bearer" && connection.client_secret) {
      headers["Authorization"] = `Bearer ${connection.client_secret}`;
    }else if (connection.auth_type === "oauth2" && connection.client_id && connection.client_secret) {
      const oAuthResponse = await getAccessToken({...connection, token_url: connection.scope || ""});
      if (oAuthResponse.status !== 200) {
        throw new Error(`${oAuthResponse.testResult}`);
      }
      headers["Authorization"] = `Bearer ${oAuthResponse.accessToken}`;
    }


    const response = await fetch(metadataUrl, { method: "GET", headers, signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`ERP returned status ${response.status}`);
    }

    const data = await response.json();
    const columns = extractColumnsFromResponse(data);
    if (columns.length === 0) {
      throw new Error("Could not extract field metadata from the ERP response.");
    }
    

    return { connected: true, columns, source: "erp_api", endpoint: metadataUrl };
  } catch (err: any) {
    const message = err?.name === "AbortError"
      ? "Connection timed out after 10 seconds"
      : err?.message || "Failed to connect to ERP";
    throw { status: 502, message: `Could not fetch metadata: ${message}. You can type ERP field names manually instead.` };
  }
}

function extractColumnsFromResponse(data: any): string[] {
  if (Array.isArray(data)) {
    if (data.length > 0 && typeof data[0] === "object") {
      return Object.keys(data[0]);
    }
    return [];
  }
  if (data && typeof data === "object") {
    // if (data["$metadata"] && data.value && Array.isArray(data.value) && data.value.length > 0) {
    if (data.value && Array.isArray(data.value) && data.value.length > 0) {
      return Object.keys(data.value[0]);
    }
    if (data.items && Array.isArray(data.items) && data.items.length > 0) {
      return Object.keys(data.items[0]);
    }
    if (data.results && Array.isArray(data.results) && data.results.length > 0) {
      return Object.keys(data.results[0]);
    }
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      return Object.keys(data.data[0]);
    }
    if (data.records && Array.isArray(data.records) && data.records.length > 0) {
      return Object.keys(data.records[0]);
    }
    const keys = Object.keys(data);
    if (keys.length > 3) {
      return keys;
    }
  }
  return [];
}

export async function syncEntity(businessEntity: string, modifiedBy: string) {
  const entity = await repo.getMasterDataEntityByKey(businessEntity);
  if (!entity) throw { status: 404, message: "Entity not found" };

  if (entity.status === "Syncing") throw { status: 409, message: "Sync already in progress for this entity" };

  const syncMode = entity.sync_mode || "standard";

  if (syncMode === "custom") {
    const handlerName = entity.custom_sync_handler?.trim();
    if (!handlerName) throw { status: 400, message: "Custom sync mode is set but no handler name is configured." };
    const handler = getSyncHandler(handlerName);
    if (!handler) throw { status: 400, message: `Custom sync handler '${handlerName}' is not registered on the server.` };

    const connection = await repo.getErpConnection();
    if (!connection) throw { status: 400, message: "No ERP connection configured. Set up an ERP connection first." };
    if (!connection.api_url || !connection.api_url.startsWith("http")) {
      throw { status: 400, message: "ERP connection has no valid API URL." };
    }

    await repo.syncEntity(businessEntity, modifiedBy);
    executeCustomSyncInBackground(entity, connection, handler, businessEntity, modifiedBy);
    return { businessEntity, status: "Syncing", message: `Custom sync initiated for ${entity.description || businessEntity} (handler: ${handlerName})` };
  }

  const mappings: Record<string, string> = entity.field_mappings || {};
  const mappedFields = Object.keys(mappings).filter(k => mappings[k]?.trim());
  if (mappedFields.length === 0) throw { status: 400, message: "Entity has no field mappings configured" };

  const erpEndpoint = entity.erp_endpoint?.trim();
  if (!erpEndpoint) throw { status: 400, message: "No ERP endpoint configured for this entity." };

  const connection = await repo.getErpConnection();
  if (!connection) throw { status: 400, message: "No ERP connection configured. Set up an ERP connection first." };
  if (!connection.api_url || !connection.api_url.startsWith("http")) {
    throw { status: 400, message: "ERP connection has no valid API URL." };
  }

  const metadataUrl = `${connection.api_url.replace(/\/$/, "")}/${erpEndpoint.replace(/^\//, "")}`;
  const urlCheck = isUrlSafe(metadataUrl);
  if (!urlCheck.safe) {
    throw { status: 400, message: `Invalid ERP URL: ${urlCheck.error}` };
  }

  await repo.syncEntity(businessEntity, modifiedBy);

  executeSyncInBackground(entity, connection, metadataUrl, mappings, mappedFields, businessEntity, modifiedBy);

  return { businessEntity, status: "Syncing", message: `Sync initiated for ${entity.description || businessEntity}` };
}

const BATCH_SIZE = 100;

export async function getSyncProgress(businessEntity: string) {
  const entity = await repo.getMasterDataEntityByKey(businessEntity);
  if (!entity) throw { status: 404, message: "Entity not found" };
  const progress = await repo.getSyncProgress(entity.id);
  if (!progress) return { status: entity.status, inserted: 0, updated: 0, failed: 0, skipped: 0, total: 0 };
  const total = (progress.inserted || 0) + (progress.updated || 0) + (progress.failed || 0) + (progress.skipped || 0);
  return {
    logId: progress.id,
    status: progress.status,
    entityStatus: entity.status,
    inserted: progress.inserted || 0,
    updated: progress.updated || 0,
    failed: progress.failed || 0,
    skipped: progress.skipped || 0,
    total,
    executionTime: progress.execution_time,
  };
}

async function executeSyncInBackground(
  entity: any,
  connection: any,
  metadataUrl: string,
  mappings: Record<string, string>,
  mappedFields: string[],
  businessEntity: string,
  modifiedBy: string
) {
  let logId: number | null = null;
  try {
    logId = await repo.createSyncLog(entity.id);

    const headers: Record<string, string> = { "Accept": "application/json" };
    if (connection.auth_type === "basic" && connection.username) {
      headers["Authorization"] = "Basic " + Buffer.from(`${connection.username}:${connection.password || ""}`).toString("base64");
    } else if (connection.auth_type === "bearer" && connection.client_secret) {
      headers["Authorization"] = `Bearer ${connection.client_secret}`;
    }else if (connection.auth_type === "oauth2" && connection.client_id && connection.client_secret) {
      const oAuthResponse = await getAccessToken({...connection, token_url: connection.scope || ""});
      if (oAuthResponse.status !== 200) {
        throw new Error(`${oAuthResponse.testResult}`);
      }
      headers["Authorization"] = `Bearer ${oAuthResponse.accessToken}`;
    }

    console.log(`[Sync] ${businessEntity}: Headers —`, headers);

    const keyField = mappedFields[0];
    const keyErpField = mappings[keyField];
    const counts = { inserted: 0, updated: 0, failed: 0, skipped: 0 };
    let batchNumber = 0;
    let totalProcessed = 0;
    let nextUrl: string | null = buildPaginatedUrl(metadataUrl, 0, BATCH_SIZE);
    const entityHook = getHook(businessEntity);
    if (entityHook) {
      console.log(`[Sync] ${businessEntity}: Post-mapping hook registered — will run for each record`);
    }

    while (nextUrl) {
      console.log(`[Sync] ${businessEntity}: Fetching batch ${batchNumber + 1} — ${nextUrl}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      let response: Response;
      try {
        response = await fetch(nextUrl, { method: "GET", headers, signal: controller.signal });
        clearTimeout(timeout);
      } catch (fetchErr: any) {
        clearTimeout(timeout);
        if (fetchErr?.name === "AbortError") {
          throw new Error(`Connection timed out on batch ${batchNumber + 1}`);
        }
        throw fetchErr;
      }

      if (!response.ok) {
        const errText = `ERP returned HTTP ${response.status} on batch ${batchNumber + 1}`;
        await repo.updateSyncLog(logId, counts, "FAILED");
        await repo.createSyncLogDetail(logId, "failed", businessEntity, errText);
        await repo.updateEntitySyncComplete(businessEntity, "Failed", modifiedBy);
        console.error(`[Sync] ${businessEntity}: ${errText}`);
        return;
      }

      const data = await response.json();
      const records = extractRecordsFromResponse(data);

      if (records.length === 0) break;

      for (const erpRecord of records) {
        try {
          let attributes: Record<string, string | null> = {};
          for (const [prokrayaCol, erpField] of Object.entries(mappings)) {
            if (erpField?.trim()) {
              const val = erpRecord[erpField];
              attributes[prokrayaCol] = val !== undefined && val !== null ? String(val) : null;
            }
          }

          if (entityHook) {
            try {
              attributes = await entityHook({
                businessEntity,
                erpRecord,
                attributes,
                mappings,
              });
            } catch (hookErr: any) {
              console.warn(`[Sync] ${businessEntity}: Hook error for record — ${hookErr?.message || "Unknown hook error"}`);
            }
          }

          const recordKey = attributes[keyField] || JSON.stringify(erpRecord).substring(0, 80);
          // const result = await repo.upsertEntityData(businessEntity, attributes, keyField, modifiedBy);
          const result = await repo.upsertDynamicEntityData(businessEntity, attributes, [keyField], modifiedBy);
          counts[result]++;
          await repo.createSyncLogDetail(logId, result, recordKey, null);
        } catch (recErr: any) {
          counts.failed++;
          const recId = erpRecord[keyErpField] || "unknown";
          await repo.createSyncLogDetail(logId, "failed", String(recId), recErr?.message || "Record processing error");
        }
      }

      totalProcessed += records.length;
      batchNumber++;
      await repo.updateSyncLog(logId, counts, "IN_PROGRESS");
      console.log(`[Sync] ${businessEntity}: Batch ${batchNumber} done — ${records.length} records (total: ${totalProcessed})`);

      const odataNext = getODataNextLink(data);
      if (odataNext) {
        const nextCheck = isUrlSafe(odataNext);
        nextUrl = nextCheck.safe ? odataNext : null;
      } else if (records.length >= BATCH_SIZE) {
        const skip = batchNumber * BATCH_SIZE;
        nextUrl = buildPaginatedUrl(metadataUrl, skip, BATCH_SIZE);
      } else {
        nextUrl = null;
      }
    }

    if (totalProcessed === 0) {
      await repo.updateSyncLog(logId, counts, "SUCCESS");
      await repo.createSyncLogDetail(logId, "skipped", businessEntity, "No records returned from ERP");
      await repo.updateEntitySyncComplete(businessEntity, "Executed", modifiedBy);
      console.log(`[Sync] ${businessEntity}: No records returned from ERP.`);
      return;
    }

    const overallStatus = counts.failed === 0 ? "SUCCESS" : (counts.inserted + counts.updated > 0 ? "PARTIAL" : "FAILED");
    await repo.updateSyncLog(logId, counts, overallStatus);
    await repo.updateEntitySyncComplete(businessEntity, "Executed", modifiedBy);
    console.log(`[Sync] ${businessEntity}: Complete — ${totalProcessed} records in ${batchNumber} batches — inserted=${counts.inserted}, updated=${counts.updated}, skipped=${counts.skipped}, failed=${counts.failed}`);

  } catch (err: any) {
    console.error(`[Sync] ${businessEntity}: Fatal error —`, err?.message || err);
    if (logId) {
      try {
        await repo.updateSyncLog(logId, { inserted: 0, updated: 0, failed: 1, skipped: 0 }, "FAILED");
        await repo.createSyncLogDetail(logId, "failed", businessEntity, err?.message || "Unknown error");
      } catch {}
    }
    try { await repo.updateEntitySyncComplete(businessEntity, "Failed", modifiedBy); } catch {}
  }
}

function buildPaginatedUrl(baseUrl: string, skip: number, top: number): string {
  const separator = baseUrl.includes("?") ? "&" : "?";
  if (baseUrl.includes("$skip") || baseUrl.includes("$top")) {
    return baseUrl;
  }
  return `${baseUrl}${separator}$skip=${skip}&$top=${top}`;
}

function getODataNextLink(data: any): string | null {
  if (data && typeof data === "object") {
    if (data["@odata.nextLink"]) return data["@odata.nextLink"];
    if (data["odata.nextLink"]) return data["odata.nextLink"];
    if (data["@nextLink"]) return data["@nextLink"];
  }
  return null;
}

function extractRecordsFromResponse(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    if (data.value && Array.isArray(data.value)) return data.value;
    if (data.items && Array.isArray(data.items)) return data.items;
    if (data.results && Array.isArray(data.results)) return data.results;
    if (data.data && Array.isArray(data.data)) return data.data;
    if (data.records && Array.isArray(data.records)) return data.records;
  }
  return [];
}

import type { CustomSyncHandlerFn } from "./custom-sync";

async function executeCustomSyncInBackground(
  entity: any,
  connection: any,
  handler: CustomSyncHandlerFn,
  businessEntity: string,
  modifiedBy: string
) {
  let logId: number | null = null;
  try {
    logId = await repo.createSyncLog(entity.id);

    const headers: Record<string, string> = { "Accept": "application/json" };
    if (connection.auth_type === "basic" && connection.username) {
      headers["Authorization"] = "Basic " + Buffer.from(`${connection.username}:${connection.password || ""}`).toString("base64");
    } else if (connection.auth_type === "bearer" && connection.client_secret) {
      headers["Authorization"] = `Bearer ${connection.client_secret}`;
    }

    const capturedLogId = logId;

    const result = await handler({
      entity: {
        id: entity.id,
        business_entity: entity.business_entity,
        description: entity.description,
        erp_endpoint: entity.erp_endpoint,
        target_table: entity.target_table,
        field_mappings: entity.field_mappings,
      },
      connection: {
        api_url: connection.api_url,
        auth_type: connection.auth_type,
        username: connection.username,
        password: connection.password,
        client_id: connection.client_id,
        client_secret: connection.client_secret,
      },
      modifiedBy,
      logId: capturedLogId,
      helpers: {
        buildAuthHeaders: () => ({ ...headers }),
        fetchJson: async (url: string) => {
          const urlCheck = isUrlSafe(url);
          if (!urlCheck.safe) throw new Error(`Unsafe URL blocked: ${urlCheck.error}`);
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);
          try {
            const response = await fetch(url, { method: "GET", headers, signal: controller.signal });
            clearTimeout(timeout);
            if (!response.ok) throw new Error(`ERP returned HTTP ${response.status}`);
            return await response.json();
          } catch (err: any) {
            clearTimeout(timeout);
            if (err?.name === "AbortError") throw new Error("Request timed out");
            throw err;
          }
        },
        createLogDetail: async (status: string, record: string, errormsg: string | null) => {
          await repo.createSyncLogDetail(capturedLogId, status, record, errormsg);
        },
        updateLogCounts: async (counts, status) => {
          await repo.updateSyncLog(capturedLogId, counts, status);
        },
      },
    });

    await repo.updateSyncLog(logId, result.counts, result.status);
    await repo.updateEntitySyncComplete(businessEntity, "Executed", modifiedBy);
    console.log(`[CustomSync] ${businessEntity}: Complete — inserted=${result.counts.inserted}, updated=${result.counts.updated}, skipped=${result.counts.skipped}, failed=${result.counts.failed}`);

  } catch (err: any) {
    console.error(`[CustomSync] ${businessEntity}: Fatal error —`, err?.message || err);
    if (logId) {
      try {
        await repo.updateSyncLog(logId, { inserted: 0, updated: 0, failed: 1, skipped: 0 }, "FAILED");
        await repo.createSyncLogDetail(logId, "failed", businessEntity, err?.message || "Custom handler error");
      } catch {}
    }
    try { await repo.updateEntitySyncComplete(businessEntity, "Failed", modifiedBy); } catch {}
  }
}

export async function getRegisteredSyncHandlers() {
  const { listSyncHandlers } = await import("./custom-sync");
  return listSyncHandlers();
}

export async function getInterfaceLogs(params: {
  page: number;
  limit: number;
  search?: string;
  transactionType?: string;
  status?: string;
  businessEntity?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return repo.getInterfaceLogs(params);
}

export async function getInterfaceLogStats() {
  return repo.getInterfaceLogStats();
}

export async function getInterfaceLogFilterOptions() {
  return repo.getInterfaceLogFilterOptions();
}

export async function getInterfaceLogById(id: number) {
  const log = await repo.getInterfaceLogById(id);
  if (!log) throw { status: 404, message: "Interface log not found" };
  return log;
}

import crypto from "crypto";

export async function getApiKeys() {
  return repo.getApiKeys();
}

export async function createApiKey(data: { key_name: string; description?: string; permissions?: string; expires_at?: string; created_by?: string }) {
  if (!data.key_name?.trim()) throw { status: 400, message: "Key name is required" };
  const rawKey = `pk_${crypto.randomBytes(32).toString('hex')}`;
  const keyPrefix = rawKey.substring(0, 7) + "...";
  const result = await repo.createApiKey({
    key_name: data.key_name.trim(),
    api_key: rawKey,
    key_prefix: keyPrefix,
    description: data.description,
    permissions: data.permissions,
    expires_at: data.expires_at,
    created_by: data.created_by,
  });
  return { ...result, api_key: rawKey };
}

export async function validateApiKey(apiKey: string) {
  if (!apiKey) return null;
  return repo.validateApiKey(apiKey);
}

export async function revokeApiKey(id: number, modifiedBy: string) {
  const key = await repo.revokeApiKey(id, modifiedBy);
  if (!key) throw { status: 404, message: "API key not found" };
  return key;
}

export async function deleteApiKey(id: number) {
  const key = await repo.deleteApiKey(id);
  if (!key) throw { status: 404, message: "API key not found" };
  return key;
}

export async function logInboundTransaction(data: {
  business_entity: string;
  business_entity_method: string;
  transaction_type: string;
  transaction_system: string;
  status: string;
  log_msg: string;
  log_msg_desc?: string;
  key_values?: string;
  http_status?: string;
  created_by?: string;
}) {
  return repo.logInboundTransaction(data);
}
