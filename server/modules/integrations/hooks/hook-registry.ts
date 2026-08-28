export interface HookContext {
  businessEntity: string;
  erpRecord: Record<string, any>;
  attributes: Record<string, string | null>;
  mappings: Record<string, string>;
}

export type EntityHookFn = (ctx: HookContext) => Promise<Record<string, string | null>>;

const hookRegistry: Record<string, EntityHookFn> = {};

export function registerHook(businessEntity: string, hookFn: EntityHookFn) {
  hookRegistry[businessEntity.toLowerCase()] = hookFn;
  console.log(`[Hooks] Registered hook for entity: ${businessEntity}`);
}

export function getHook(businessEntity: string): EntityHookFn | null {
  return hookRegistry[businessEntity.toLowerCase()] || null;
}

export function hasHook(businessEntity: string): boolean {
  return businessEntity.toLowerCase() in hookRegistry;
}

export function listHooks(): string[] {
  return Object.keys(hookRegistry);
}
