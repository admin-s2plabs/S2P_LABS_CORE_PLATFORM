export interface CustomSyncContext {
  entity: {
    id: number;
    business_entity: string;
    description: string;
    erp_endpoint: string | null;
    target_table: string | null;
    field_mappings: Record<string, string> | null;
  };
  connection: {
    api_url: string;
    auth_type: string;
    username?: string;
    password?: string;
    client_id?: string;
    client_secret?: string;
  };
  modifiedBy: string;
  logId: number;
  helpers: {
    buildAuthHeaders: () => Record<string, string>;
    fetchJson: (url: string) => Promise<any>;
    createLogDetail: (status: string, record: string, errormsg: string | null) => Promise<void>;
    updateLogCounts: (counts: SyncCounts, status: string) => Promise<void>;
  };
}

export interface SyncCounts {
  inserted: number;
  updated: number;
  failed: number;
  skipped: number;
}

export type CustomSyncResult = {
  counts: SyncCounts;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
};

export type CustomSyncHandlerFn = (ctx: CustomSyncContext) => Promise<CustomSyncResult>;

const handlerRegistry: Record<string, CustomSyncHandlerFn> = {};

export function registerSyncHandler(handlerName: string, handlerFn: CustomSyncHandlerFn) {
  handlerRegistry[handlerName.toLowerCase()] = handlerFn;
  console.log(`[CustomSync] Registered handler: ${handlerName}`);
}

export function getSyncHandler(handlerName: string): CustomSyncHandlerFn | null {
  return handlerRegistry[handlerName.toLowerCase()] || null;
}

export function hasSyncHandler(handlerName: string): boolean {
  return handlerName.toLowerCase() in handlerRegistry;
}

export function listSyncHandlers(): string[] {
  return Object.keys(handlerRegistry);
}
