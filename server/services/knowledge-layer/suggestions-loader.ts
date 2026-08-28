import fs from "fs";
import { assetPath } from "./asset-path";

/**
 * Serves the example-prompt chips shown on each agent page from
 * `ai/prompts/suggestions/<agent>-suggestions.json`.
 *
 * These used to be TypeScript constants compiled into the client bundle, which meant a
 * full rebuild and redeploy to reword a single example. As data behind an API they can
 * be edited like any other knowledge-layer asset.
 */

const SUGGESTIONS_SUBDIR = "prompts/suggestions";
const isDev = process.env.NODE_ENV !== "production";

export interface PromptCategory {
  module: string;
  icon: string;
  prompts: string[];
}

export interface AgentSuggestions {
  quickActions: Record<string, string>;
  categories: PromptCategory[];
}

const cache = new Map<string, AgentSuggestions>();

/** Agent keys are used in a filesystem path, so allow only a safe charset. */
function assertSafeAgentKey(agentType: string): void {
  if (!/^[a-z0-9-]+$/i.test(agentType)) {
    throw new Error(`[knowledge-layer] invalid agent key "${agentType}"`);
  }
}

/** Returns null when an agent has no suggestions file yet (not an error). */
export function loadSuggestions(agentType: string): AgentSuggestions | null {
  assertSafeAgentKey(agentType);

  if (!isDev) {
    const hit = cache.get(agentType);
    if (hit) return hit;
  }

  const file = assetPath(SUGGESTIONS_SUBDIR, `${agentType}-suggestions.json`);
  if (!fs.existsSync(file)) return null;

  let parsed: AgentSuggestions;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err: any) {
    throw new Error(`[knowledge-layer] ${agentType}-suggestions.json is not valid JSON: ${err?.message ?? err}`);
  }

  if (!Array.isArray(parsed?.categories)) {
    throw new Error(`[knowledge-layer] ${agentType}-suggestions.json must contain a "categories" array`);
  }

  if (!isDev) cache.set(agentType, parsed);
  return parsed;
}
