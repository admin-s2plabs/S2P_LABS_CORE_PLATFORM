export { registerHook, getHook, hasHook, listHooks } from "./hook-registry";
export type { HookContext, EntityHookFn } from "./hook-registry";

/**
 * DEVELOPER INSTRUCTIONS — How to add a hook for an entity:
 *
 * 1. Create a new file in this folder (e.g., purchase-requests.ts)
 * 2. Import { registerHook, HookContext } from "./hook-registry"
 * 3. Write your hook function that takes HookContext and returns modified attributes
 * 4. Call registerHook("YOUR_ENTITY_KEY", yourHookFunction)
 * 5. Import your file below so it auto-registers on server start
 *
 * See _example-hook.ts for a detailed reference with common patterns.
 */

// Import hook files here to auto-register them on server start:
// import "./purchase-requests";
// import "./suppliers";
// import "./cost-centers";
