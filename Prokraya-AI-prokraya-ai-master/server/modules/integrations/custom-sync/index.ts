export {
  registerSyncHandler,
  getSyncHandler,
  hasSyncHandler,
  listSyncHandlers,
} from "./sync-handler-registry";
export type {
  CustomSyncContext,
  CustomSyncResult,
  CustomSyncHandlerFn,
  SyncCounts,
} from "./sync-handler-registry";

/**
 * DEVELOPER INSTRUCTIONS — How to add a custom sync handler:
 *
 * 1. Create a new file in this folder (e.g., vendor-sync.ts)
 * 2. Import { registerSyncHandler, CustomSyncContext, CustomSyncResult } from "./sync-handler-registry"
 * 3. Write your handler function that takes CustomSyncContext and returns CustomSyncResult
 * 4. Call registerSyncHandler("your_handler_name", yourHandlerFunction)
 * 5. Import your file below so it auto-registers on server start
 * 6. In the entity config, set sync_mode = "custom" and custom_sync_handler = "your_handler_name"
 *
 * The handler receives:
 *   - entity config (id, business_entity, endpoint, mappings)
 *   - ERP connection details (api_url, auth)
 *   - helpers: buildAuthHeaders(), fetchJson(url), createLogDetail(), updateLogCounts()
 *
 * See _example-vendor-sync.ts for a parent-child pattern reference.
 */

// Import custom handler files here to auto-register them on server start:
// import "./vendor-sync";
// import "./purchase-orders-sync";
