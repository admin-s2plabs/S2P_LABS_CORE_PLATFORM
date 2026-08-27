import { pool } from "../_shared";
import { getContextPool } from "../../tenant-context";
const getPool = () => getContextPool() ?? pool;
import { propertiesService } from "../../services/propertiesService";

const ERP_CONNECTION_KEY = "ERP_CONNECTION";

export async function getMasterDataEntities() {
  const result = await getPool().query(`
    SELECT id, business_entity, description, status, last_execution_date,
           last_modified_by, last_modified_date, created_by, creation_date,
           target_table, field_mappings, erp_endpoint,
           sync_mode, custom_sync_handler
    FROM dbo.am_masterdata_trans_dtls
    ORDER BY id ASC
  `);
  return result.rows;
}

export async function getMasterDataEntityById(id: number) {
  const result = await getPool().query(
    `SELECT * FROM dbo.am_masterdata_trans_dtls WHERE id = $1`, [id]
  );
  return result.rows[0] || null;
}

export async function getMasterDataEntityByKey(businessEntity: string) {
  const result = await getPool().query(
    `SELECT * FROM dbo.am_masterdata_trans_dtls WHERE business_entity = $1`, [businessEntity]
  );
  return result.rows[0] || null;
}

export async function createMasterDataEntity(data: {
  business_entity: string;
  description?: string;
  target_table?: string;
  erp_endpoint?: string;
  created_by?: string;
}) {
  const result = await getPool().query(`
    INSERT INTO dbo.am_masterdata_trans_dtls 
    (business_entity, description, target_table, erp_endpoint, status, field_mappings, sync_mode, created_by, creation_date, last_modified_by, last_modified_date)
    VALUES ($1, $2, $3, $4, 'Pending', '{}', 'standard', $5, NOW(), $5, NOW())
    RETURNING *
  `, [data.business_entity, data.description || null, data.target_table || null, data.erp_endpoint || null, data.created_by || 'System']);
  return result.rows[0];
}

export async function updateMasterDataEntityStatus(id: number, status: string, modifiedBy: string) {
  const result = await getPool().query(`
    UPDATE dbo.am_masterdata_trans_dtls 
    SET status = $1, last_execution_date = NOW(), last_modified_by = $2, last_modified_date = NOW()
    WHERE id = $3
    RETURNING *
  `, [status, modifiedBy, id]);
  return result.rows[0];
}

export async function getErpConnection(): Promise<any | null> {
  // const json = await propertiesService.get(ERP_CONNECTION_KEY, "");
  const json = await getPool().query(`SELECT prop_value FROM dbo.am_property_mst WHERE prop_code = $1`, [ERP_CONNECTION_KEY]);
 
  if (!json) return null;
  try {
    return JSON.parse(json.rows[0].prop_value);
  } catch {
    return null;
  }
}


export async function saveErpConnection(data: {
  erp_type: string;
  erp_name: string;
  api_url?: string;
  resource_url?: string;
  auth_type?: string;
  username?: string;
  password?: string;
  client_id?: string;
  client_secret?: string;
  tenant_id?: string;
  scope?: string;
  extra_fields?: Record<string, string>;
  created_by?: string;
  modified_by?: string;
}): Promise<any> {
  const existing = await getErpConnection();
  const now = new Date().toISOString();

  const connection = {
    erp_type: data.erp_type ?? existing?.erp_type ?? "",
    erp_name: data.erp_name ?? existing?.erp_name ?? "",
    api_url: data.api_url ?? existing?.api_url ?? "",
    resource_url: data.resource_url ?? existing?.resource_url ?? "",
    auth_type: data.auth_type ?? existing?.auth_type ?? "basic",
    username: data.username ?? existing?.username ?? "",
    password: data.password ?? existing?.password ?? "",
    client_id: data.client_id ?? existing?.client_id ?? "",
    client_secret: data.client_secret ?? existing?.client_secret ?? "",
    tenant_id: data.tenant_id ?? existing?.tenant_id ?? "",
    scope: data.scope ?? existing?.scope ?? "",
    extra_fields: data.extra_fields ?? existing?.extra_fields ?? {},
    status: existing?.status ?? "inactive",
    last_tested_at: existing?.last_tested_at ?? null,
    test_result: existing?.test_result ?? null,
    created_by: existing?.created_by ?? data.created_by ?? "System",
    creation_date: existing?.creation_date ?? now,
    last_modified_by: data.modified_by ?? data.created_by ?? "System",
    last_modified_date: now,
  };

  await propertiesService.set(ERP_CONNECTION_KEY, JSON.stringify(connection));
  return connection;
}

export async function deleteErpConnection() {
  await propertiesService.set(ERP_CONNECTION_KEY, "");
}

export async function updateErpConnectionStatus(status: string, testResult: string) {
  const existing = await getErpConnection();
  if (!existing) return null;
  existing.status = status;
  existing.test_result = testResult;
  existing.last_tested_at = new Date().toISOString();
  await propertiesService.set(ERP_CONNECTION_KEY, JSON.stringify(existing));
  return existing;
}

export async function getEntityTransactions(businessEntity: string, page: number = 1, limit: number = 25) {
  const offset = (page - 1) * limit;
  const countResult = await getPool().query(
    `SELECT COUNT(*) as total FROM dbo.am_extsys_trans_dtls WHERE business_entity = $1`,
    [businessEntity]
  );
  const total = parseInt(countResult.rows[0].total, 10);
  const result = await getPool().query(`
    SELECT id, business_entity, business_entity_method, status, 
           transaction_type, transaction_system, key_values,
           log_msg, log_msg_desc, start_date, end_date,
           created_by, creation_date
    FROM dbo.am_extsys_trans_dtls
    WHERE business_entity = $1
    ORDER BY id DESC
    LIMIT $2 OFFSET $3
  `, [businessEntity, limit, offset]);
  return { rows: result.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getEntityTransactionById(id: number) {
  const result = await getPool().query(
    `SELECT * FROM dbo.am_extsys_trans_dtls WHERE id = $1`, [id]
  );
  return result.rows[0] || null;
}

export async function getEntityTransactionStats(businessEntity: string) {
  const result = await getPool().query(`
    SELECT 
      COALESCE(SUM(COALESCE(l.inserted, 0) + COALESCE(l.updated, 0) + COALESCE(l.failed, 0) + COALESCE(l.skipped, 0)), 0) as total,
      COALESCE(SUM(COALESCE(l.inserted, 0) + COALESCE(l.updated, 0)), 0) as success_count,
      COALESCE(SUM(COALESCE(l.failed, 0)), 0) as failed_count,
      COALESCE(SUM(COALESCE(l.skipped, 0)), 0) as skipped_count,
      COUNT(*) as run_count,
      MIN(l.execution_time) as first_sync,
      MAX(l.execution_time) as last_sync
    FROM dbo.mst_mgrt_log l
    JOIN dbo.am_masterdata_trans_dtls e ON e.id = l.entityid
    WHERE e.business_entity = $1
  `, [businessEntity]);
  return result.rows[0];
}

export async function getEntitySyncRuns(businessEntity: string) {
  const result = await getPool().query(`
    SELECT 
      l.id as run_id,
      l.execution_time,
      l.status as overall_status,
      l.inserted,
      l.updated,
      l.failed,
      l.skipped,
      (COALESCE(l.inserted, 0) + COALESCE(l.updated, 0) + COALESCE(l.failed, 0) + COALESCE(l.skipped, 0)) as total
    FROM dbo.mst_mgrt_log l
    JOIN dbo.am_masterdata_trans_dtls e ON e.id = l.entityid
    WHERE e.business_entity = $1
    ORDER BY l.execution_time DESC
  `, [businessEntity]);
  return result.rows;
}

export async function getEntityTransactionsByRunId(runId: number, page: number = 1, limit: number = 50, statusFilter?: string) {
  const offset = (page - 1) * limit;
  let whereClause = `WHERE execution_id = $1`;
  const params: any[] = [runId];
  if (statusFilter) {
    params.push(statusFilter);
    whereClause += ` AND LOWER(status) = LOWER($${params.length})`;
  }
  const countResult = await getPool().query(
    `SELECT COUNT(*) as total FROM dbo.mst_mgrt_log_dtls ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);
  const result = await getPool().query(`
    SELECT id, execution_id, status, record, errormsg
    FROM dbo.mst_mgrt_log_dtls
    ${whereClause}
    ORDER BY id DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, limit, offset]);
  return { rows: result.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getEntityRecordById(id: number) {
  const result = await getPool().query(`
    SELECT d.*, l.execution_time, l.status as run_status
    FROM dbo.mst_mgrt_log_dtls d
    JOIN dbo.mst_mgrt_log l ON l.id = d.execution_id
    WHERE d.id = $1
  `, [id]);
  return result.rows[0] || null;
}

export async function getTableColumns(tableName: string) {
  const parts = tableName.split(".");
  let schema = "dbo";
  let table = tableName;
  if (parts.length === 2) {
    schema = parts[0];
    table = parts[1];
  }
  const result = await getPool().query(`
    SELECT column_name, data_type, is_nullable, column_default, ordinal_position
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position ASC
  `, [schema, table]);
  return result.rows;
}

export async function updateEntityMapping(businessEntity: string, data: {
  erp_endpoint?: string;
  field_mappings?: Record<string, string>;
  modified_by?: string;
}) {
  const existing = await getMasterDataEntityByKey(businessEntity);
  if (!existing) return null;

  const mappings = data.field_mappings ?? existing.field_mappings ?? {};
  const targetTable = existing.target_table;
  let mappingStatus = "unmapped";
  if (targetTable) {
    const columns = await getTableColumns(targetTable);
    const columnNamesList = columns.map((c: any) => c.column_name as string);
    const mappedColumnNames = columnNamesList.filter(col => mappings[col]?.trim());
    if (mappedColumnNames.length === 0) {
      mappingStatus = "unmapped";
    } else if (mappedColumnNames.length >= columnNamesList.length) {
      mappingStatus = "mapped";
    } else {
      mappingStatus = "partial";
    }
  } else {
    const mappedFields = Object.keys(mappings).filter(k => mappings[k]?.trim());
    mappingStatus = mappedFields.length > 0 ? "mapped" : "unmapped";
  }

  const result = await getPool().query(`
    UPDATE dbo.am_masterdata_trans_dtls
    SET erp_endpoint = COALESCE($1, erp_endpoint),
        field_mappings = $2,
        last_modified_by = $3,
        last_modified_date = NOW()
    WHERE business_entity = $4
    RETURNING *
  `, [
    data.erp_endpoint ?? existing.erp_endpoint,
    JSON.stringify(mappings),
    data.modified_by || "System",
    businessEntity
  ]);
  const row = result.rows[0];
  if (row) row._mapping_status = mappingStatus;
  return row;
}

export async function syncEntity(businessEntity: string, modifiedBy: string) {
  const entity = await getMasterDataEntityByKey(businessEntity);
  if (!entity) return null;
  await getPool().query(`
    UPDATE dbo.am_masterdata_trans_dtls
    SET status = 'Syncing', last_modified_by = $1, last_modified_date = NOW()
    WHERE business_entity = $2
  `, [modifiedBy, businessEntity]);
  return { ...entity, status: 'Syncing' };
}

export async function updateEntityDetails(businessEntity: string, data: {
  description?: string;
  target_table?: string;
  erp_endpoint?: string;
  sync_mode?: string;
  custom_sync_handler?: string | null;
  modified_by?: string;
}) {
  const existing = await getMasterDataEntityByKey(businessEntity);
  if (!existing) return null;

  const result = await getPool().query(`
    UPDATE dbo.am_masterdata_trans_dtls
    SET description = COALESCE($1, description),
        target_table = COALESCE($2, target_table),
        erp_endpoint = COALESCE($3, erp_endpoint),
        sync_mode = COALESCE($4, sync_mode),
        custom_sync_handler = $5,
        last_modified_by = $6,
        last_modified_date = NOW()
    WHERE business_entity = $7
    RETURNING *
  `, [
    data.description ?? existing.description,
    data.target_table ?? existing.target_table,
    data.erp_endpoint ?? existing.erp_endpoint,
    data.sync_mode ?? existing.sync_mode ?? "standard",
    data.custom_sync_handler !== undefined ? data.custom_sync_handler : existing.custom_sync_handler,
    data.modified_by || "System",
    businessEntity,
  ]);
  return result.rows[0] || null;
}

export async function updateEntitySyncComplete(businessEntity: string, status: string, modifiedBy: string) {
  const result = await getPool().query(`
    UPDATE dbo.am_masterdata_trans_dtls
    SET status = $1, last_execution_date = NOW(), last_modified_by = $2, last_modified_date = NOW()
    WHERE business_entity = $3
    RETURNING *
  `, [status, modifiedBy, businessEntity]);
  return result.rows[0] || null;
}

export async function createSyncLog(entityId: number) {
  const result = await getPool().query(`
    INSERT INTO dbo.mst_mgrt_log (entityid, execution_time, status, inserted, updated, failed, skipped)
    VALUES ($1, NOW(), 'IN_PROGRESS', 0, 0, 0, 0)
    RETURNING id
  `, [entityId]);
  return result.rows[0].id as number;
}

export async function updateSyncLog(logId: number, counts: {
  inserted: number; updated: number; failed: number; skipped: number;
}, status: string) {
  await getPool().query(`
    UPDATE dbo.mst_mgrt_log
    SET inserted = $1, updated = $2, failed = $3, skipped = $4, status = $5
    WHERE id = $6
  `, [counts.inserted, counts.updated, counts.failed, counts.skipped, status, logId]);
}

export async function getSyncProgress(entityId: number) {
  const result = await getPool().query(`
    SELECT id, entityid, execution_time, status, inserted, updated, failed, skipped
    FROM dbo.mst_mgrt_log
    WHERE entityid = $1
    ORDER BY id DESC
    LIMIT 1
  `, [entityId]);
  return result.rows[0] || null;
}

const ALLOWED_ATTRIBUTE_COLS_LIST = Array.from({ length: 15 }, (_, i) => `attribute_${i + 1}`);
const ALLOWED_ATTRIBUTE_COLS = new Set(ALLOWED_ATTRIBUTE_COLS_LIST);

export async function createSyncLogDetail(executionId: number, status: string, record: string, errormsg: string | null) {
  await getPool().query(`
    INSERT INTO dbo.mst_mgrt_log_dtls (id, execution_id, status, record, errormsg)
    VALUES (
      (SELECT COALESCE(MAX(id), 0) + 1 FROM dbo.mst_mgrt_log_dtls),
      $1, $2, $3, $4
    )
  `, [executionId, status, record, errormsg]);
}

export async function upsertEntityData(
  businessEntity: string,
  attributes: Record<string, string | null>,
  keyAttribute: string,
  modifiedBy: string
): Promise<"inserted" | "updated" | "skipped"> {
  if (!ALLOWED_ATTRIBUTE_COLS.has(keyAttribute)) return "skipped";

  const keyValue = attributes[keyAttribute];
  if (!keyValue) return "skipped";

  const safeAttrs: Record<string, string | null> = {};
  for (const [col, val] of Object.entries(attributes)) {
    if (ALLOWED_ATTRIBUTE_COLS.has(col)) {
      safeAttrs[col] = val;
    }
  }

  const existing = await getPool().query(`
    SELECT id FROM dbo.am_masterdata_trans_dtls
    WHERE business_entity = $1 AND ${keyAttribute} = $2
    AND (field_mappings IS NULL OR field_mappings = '{}'::jsonb)
    AND target_table IS NULL
  `, [businessEntity, keyValue]);

  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  for (let i = 0; i < ALLOWED_ATTRIBUTE_COLS_LIST.length; i++) {
    const col = ALLOWED_ATTRIBUTE_COLS_LIST[i];
    if (safeAttrs[col] !== undefined) {
      setClauses.push(`${col} = $${paramIdx}`);
      values.push(safeAttrs[col]);
      paramIdx++;
    }
  }

  if (existing.rows.length > 0) {
    if (setClauses.length === 0) return "skipped";
    values.push(modifiedBy, existing.rows[0].id);
    await getPool().query(`
      UPDATE dbo.am_masterdata_trans_dtls
      SET ${setClauses.join(", ")},
          last_modified_by = $${paramIdx}, last_modified_date = NOW()
      WHERE id = $${paramIdx + 1}
    `, values);
    return "updated";
  } else {
    const insertCols: string[] = ["business_entity", "created_by", "creation_date", "last_modified_by", "last_modified_date"];
    const insertVals: any[] = [businessEntity, modifiedBy, new Date(), modifiedBy, new Date()];
    for (let i = 0; i < ALLOWED_ATTRIBUTE_COLS_LIST.length; i++) {
      const col = ALLOWED_ATTRIBUTE_COLS_LIST[i];
      if (safeAttrs[col] !== undefined) {
        insertCols.push(col);
        insertVals.push(safeAttrs[col]);
      }
    }
    const placeholders = insertVals.map((_, i) => `$${i + 1}`).join(", ");
    await getPool().query(`
      INSERT INTO dbo.am_masterdata_trans_dtls (${insertCols.join(", ")})
      VALUES (${placeholders})
    `, insertVals);
    return "inserted";
  }
}


export async function upsertDynamicEntityData(
  businessEntity: string,
  data: Record<string, any>,
  keyColumns: string[],
  modifiedBy: string
): Promise<"inserted" | "updated" | "skipped"> {
  const masterDataEntity = await getMasterDataEntityByKey(businessEntity);

  if (!masterDataEntity) {
    throw new Error("Master data entity not found");
  }
  const targetTable = masterDataEntity.target_table?.trim() || "";

  if (!targetTable) {
    throw new Error("Target table not found");
  }

  if (!keyColumns.length) {
    throw new Error("At least one key column is required");
  }

  // Validate table name
  const SAFE_NAME_REGEX = /^[a-zA-Z0-9_\.]+$/;

  if (!SAFE_NAME_REGEX.test(targetTable)) {
    throw new Error("Invalid target table name");
  }

  // Validate columns
  for (const col of Object.keys(data)) {
    if (!SAFE_NAME_REGEX.test(col)) {
      throw new Error(`Invalid column name: ${col}`);
    }
  }

  for (const key of keyColumns) {
    if (!SAFE_NAME_REGEX.test(key)) {
      throw new Error(`Invalid key column: ${key}`);
    }
  }

  // Ensure key values exist
  for (const key of keyColumns) {
    if (
      data[key] === undefined ||
      data[key] === null ||
      data[key] === ""
    ) {
      return "skipped";
    }
  }

  // -----------------------------
  // CHECK EXISTING RECORD
  // -----------------------------

  const whereClauses: string[] = [];
  const whereValues: any[] = [];

  keyColumns.forEach((key, index) => {
    whereClauses.push(`${key} = $${index + 1}`);
    whereValues.push(data[key]);
  });

  const existingQuery = `
    SELECT id
    FROM ${targetTable}
    WHERE ${whereClauses.join(" AND ")}
    LIMIT 1
  `;

  const existing = await getPool().query(
    existingQuery,
    whereValues
  );

  // -----------------------------
  // UPDATE
  // -----------------------------

  if (existing.rows.length > 0) {

    const updateClauses: string[] = [];
    const updateValues: any[] = [];

    let paramIndex = 1;

    for (const [col, value] of Object.entries(data)) {

      // skip key columns in update
      if (keyColumns.includes(col)) {
        continue;
      }

      updateClauses.push(`${col} = $${paramIndex}`);
      updateValues.push(value);

      paramIndex++;
    }

    // audit columns
    updateClauses.push(`last_modified_by = $${paramIndex}`);
    updateValues.push(modifiedBy);

    paramIndex++;

    updateClauses.push(`last_modified_date = NOW()`);

    const idParam = paramIndex;

    updateValues.push(existing.rows[0].id);

    const updateQuery = `
      UPDATE ${targetTable}
      SET ${updateClauses.join(", ")}
      WHERE id = $${idParam}
    `;

    await getPool().query(updateQuery, updateValues);

    return "updated";
  }

  // -----------------------------
  // INSERT
  // -----------------------------

  const insertColumns: string[] = [];
  const insertPlaceholders: string[] = [];
  const insertValues: any[] = [];

  let insertParamIndex = 1;

  for (const [col, value] of Object.entries(data)) {
    insertColumns.push(col);
    insertPlaceholders.push(`$${insertParamIndex}`);

    insertValues.push(value);

    insertParamIndex++;
  }

  // audit fields
  insertColumns.push(
    "created_by",
    "last_modified_by",
    "last_modified_date"
  );

  insertPlaceholders.push(
    `$${insertParamIndex++}`,
    `$${insertParamIndex++}`,
    `NOW()`
  );

  insertValues.push(modifiedBy, modifiedBy);

  const insertQuery = `
    INSERT INTO ${targetTable}
    (${insertColumns.join(", ")})
    VALUES (${insertPlaceholders.join(", ")})
  `;

  await getPool().query(insertQuery, insertValues);

  return "inserted";
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
  const { page, limit, search, transactionType, status, businessEntity, dateFrom, dateTo } = params;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (search) {
    conditions.push(`(COALESCE(business_entity,'') ILIKE $${idx} OR COALESCE(log_msg,'') ILIKE $${idx} OR COALESCE(key_values,'') ILIKE $${idx} OR COALESCE(transaction_system,'') ILIKE $${idx} OR COALESCE(created_by,'') ILIKE $${idx})`);
    values.push(`%${search}%`);
    idx++;
  }
  if (transactionType && transactionType !== "all") {
    conditions.push(`transaction_type = $${idx}`);
    values.push(transactionType);
    idx++;
  }
  if (status && status !== "all") {
    conditions.push(`status = $${idx}`);
    values.push(status);
    idx++;
  }
  if (businessEntity && businessEntity !== "all") {
    conditions.push(`business_entity = $${idx}`);
    values.push(businessEntity);
    idx++;
  }
  if (dateFrom) {
    conditions.push(`start_date >= $${idx}::timestamp`);
    values.push(dateFrom);
    idx++;
  }
  if (dateTo) {
    conditions.push(`start_date <= ($${idx}::timestamp + interval '1 day')`);
    values.push(dateTo);
    idx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await getPool().query(
    `SELECT COUNT(*) as total FROM dbo.am_extsys_trans_dtls ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].total);

  const dataResult = await getPool().query(
    `SELECT id, business_entity, business_entity_method, transaction_type, transaction_system,
            status, log_msg, log_msg_desc, key_values, start_date, end_date,
            created_by, creation_date, attribute_2 as http_status
     FROM dbo.am_extsys_trans_dtls
     ${whereClause}
     ORDER BY id DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...values, limit, offset]
  );

  return {
    data: dataResult.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getInterfaceLogStats() {
  const result = await getPool().query(`
    SELECT 
      COUNT(*) as total_records,
      COUNT(DISTINCT business_entity) as total_entities,
      COUNT(DISTINCT transaction_type) as total_types,
      COUNT(CASE WHEN status = 'Success' THEN 1 END) as success_count,
      COUNT(CASE WHEN status IN ('Error','Failed','Failure') THEN 1 END) as error_count,
      MIN(start_date) as earliest_date,
      MAX(start_date) as latest_date
    FROM dbo.am_extsys_trans_dtls
  `);
  return result.rows[0];
}

export async function getInterfaceLogFilterOptions() {
  const typesResult = await getPool().query(`SELECT DISTINCT transaction_type FROM dbo.am_extsys_trans_dtls WHERE transaction_type IS NOT NULL ORDER BY transaction_type`);
  const statusResult = await getPool().query(`SELECT DISTINCT status FROM dbo.am_extsys_trans_dtls WHERE status IS NOT NULL AND status != '' ORDER BY status`);
  const entitiesResult = await getPool().query(`SELECT DISTINCT business_entity FROM dbo.am_extsys_trans_dtls WHERE business_entity IS NOT NULL ORDER BY business_entity`);
  return {
    transactionTypes: typesResult.rows.map((r: any) => r.transaction_type),
    statuses: statusResult.rows.map((r: any) => r.status),
    entities: entitiesResult.rows.map((r: any) => r.business_entity),
  };
}

export async function getInterfaceLogById(id: number) {
  const result = await getPool().query(`SELECT * FROM dbo.am_extsys_trans_dtls WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

export async function getApiKeys() {
  const result = await getPool().query(`
    SELECT id, key_name, key_prefix, status, permissions, description,
           last_used_at, expires_at, created_by, creation_date as created_at, last_modified_by, last_modified_date
    FROM dbo.am_api_keys ORDER BY id DESC
  `);
  return result.rows;
}

export async function createApiKey(data: {
  key_name: string;
  api_key: string;
  key_prefix: string;
  description?: string;
  permissions?: string;
  expires_at?: string;
  created_by?: string;
}) {
  const result = await getPool().query(`
    INSERT INTO dbo.am_api_keys (id, key_name, api_key, key_prefix, status, permissions, description, expires_at, created_by, creation_date, last_modified_by, last_modified_date)
    VALUES (
      (SELECT COALESCE(MAX(id), 0) + 1 FROM dbo.am_api_keys),
      $1, $2, $3, 'Active', $4, $5, $6, $7, NOW(), $7, NOW()
    )
    RETURNING id, key_name, key_prefix, status, permissions, description, expires_at, created_by, creation_date
  `, [data.key_name, data.api_key, data.key_prefix, data.permissions || 'inbound', data.description || null, data.expires_at || null, data.created_by || 'System']);
  return result.rows[0];
}

export async function validateApiKey(apiKey: string) {
  const result = await getPool().query(`
    SELECT id, key_name, status, permissions, expires_at
    FROM dbo.am_api_keys
    WHERE api_key = $1 AND status = 'Active'
  `, [apiKey]);
  const key = result.rows[0];
  if (!key) return null;
  if (key.expires_at && new Date(key.expires_at) < new Date()) return null;
  await getPool().query(`UPDATE dbo.am_api_keys SET last_used_at = NOW() WHERE id = $1`, [key.id]);
  return key;
}

export async function revokeApiKey(id: number, modifiedBy: string) {
  const result = await getPool().query(`
    UPDATE dbo.am_api_keys SET status = 'Revoked', last_modified_by = $1, last_modified_date = NOW()
    WHERE id = $2 RETURNING *
  `, [modifiedBy, id]);
  return result.rows[0];
}

export async function deleteApiKey(id: number) {
  const result = await getPool().query(`DELETE FROM dbo.am_api_keys WHERE id = $1 RETURNING id`, [id]);
  return result.rows[0];
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
  const result = await getPool().query(`
    INSERT INTO dbo.am_extsys_trans_dtls
    (id, business_entity, business_entity_method, transaction_type, transaction_system,
     status, log_msg, log_msg_desc, key_values, attribute_2,
     start_date, end_date, created_by)
    VALUES (
      (SELECT COALESCE(MAX(id), 0) + 1 FROM dbo.am_extsys_trans_dtls),
      $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), $10
    )
    RETURNING id
  `, [
    data.business_entity, data.business_entity_method, data.transaction_type,
    data.transaction_system, data.status, data.log_msg, data.log_msg_desc || null,
    data.key_values || null, data.http_status || null, data.created_by || 'API'
  ]);
  return result.rows[0];
}
