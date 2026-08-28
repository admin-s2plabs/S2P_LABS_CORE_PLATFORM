import fs from "fs";
import { z } from "zod";
import type OpenAI from "openai";
import { assetPath } from "./asset-path";

/**
 * Loads agent tool catalogs from `ai/skills/<agent>.skills.json`.
 *
 * Moving tools from a typed TS array into JSON gives up compile-time checking, so this
 * loader restores an equivalent guarantee at boot: every file is Zod-validated, and
 * `assertDispatcherParity()` cross-checks tool names against the agent's
 * `executeToolCall()` dispatcher in BOTH directions.
 */

const SKILLS_SUBDIR = "skills";
const isDev = process.env.NODE_ENV !== "production";

/** OpenAI function-tool shape, plus a `tags` extension used for per-surface filtering. */
const skillSchema = z.object({
  type: z.literal("function"),
  tags: z.array(z.string()).optional(),
  function: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    parameters: z.record(z.any()).optional(),
  }),
});

const skillsFileSchema = z.array(skillSchema).min(1);

export type Skill = z.infer<typeof skillSchema>;

const cache = new Map<string, Skill[]>();

function skillsFile(agentType: string): string {
  return assetPath(SKILLS_SUBDIR, `${agentType}.skills.json`);
}

function readSkills(agentType: string): Skill[] {
  const file = skillsFile(agentType);
  if (!fs.existsSync(file)) {
    throw new Error(`[knowledge-layer] no skills file for agent "${agentType}" at ${file}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err: any) {
    throw new Error(`[knowledge-layer] ${agentType}.skills.json is not valid JSON: ${err?.message ?? err}`);
  }

  const result = skillsFileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`[knowledge-layer] ${agentType}.skills.json failed validation:\n${issues}`);
  }

  const names = result.data.map((s) => s.function.name);
  const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
  if (duplicates.length) {
    throw new Error(`[knowledge-layer] ${agentType}.skills.json has duplicate tool names: ${Array.from(new Set(duplicates)).join(", ")}`);
  }

  return result.data;
}

export interface LoadSkillsOptions {
  /** Reserved for per-tenant skill overrides (F5); file tier only today. */
  tenantKey?: string;
}

/**
 * Tools for an agent, optionally narrowed by tag.
 *
 * `loadSkills("sourcing", ["chat"])` replaces inline `TOOLS.filter(...)` expressions.
 * A tool with no `tags` is always included; tags narrow rather than opt in.
 */
export function loadSkills(
  agentType: string,
  tags?: string[],
  _options: LoadSkillsOptions = {},
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  let skills: Skill[];
  if (isDev) {
    skills = readSkills(agentType);
  } else {
    const hit = cache.get(agentType);
    skills = hit ?? readSkills(agentType);
    if (!hit) cache.set(agentType, skills);
  }

  const selected = tags?.length
    ? skills.filter((s) => !s.tags?.length || s.tags.some((t) => tags.includes(t)))
    : skills;

  // `tags` is our own extension; strip it so only the provider-recognised shape is sent.
  return selected.map(({ tags: _t, ...tool }) => tool) as OpenAI.Chat.Completions.ChatCompletionTool[];
}

/** Tool names declared in the skills file. */
export function skillNames(agentType: string): string[] {
  return loadSkills(agentType).map((t) => (t as any).function.name);
}

/**
 * Cross-check the skills file against the names the agent's dispatcher actually handles.
 *
 * Catches the two failure modes that moving to JSON would otherwise hide:
 *   - a tool advertised to the model with no implementation (model calls it, runtime throws)
 *   - an implemented tool missing from the catalog (dead code the model can never reach)
 *
 * Call at boot so mismatches fail startup, not a user's query.
 */
export function assertDispatcherParity(agentType: string, dispatcherToolNames: readonly string[]): void {
  const declared = new Set(skillNames(agentType));
  const handled = new Set(dispatcherToolNames);

  const missingImpl = Array.from(declared).filter((n) => !handled.has(n)).sort();
  const missingDecl = Array.from(handled).filter((n) => !declared.has(n)).sort();

  if (missingImpl.length || missingDecl.length) {
    const parts = [`[knowledge-layer] skills/dispatcher mismatch for agent "${agentType}":`];
    if (missingImpl.length) parts.push(`  in ${agentType}.skills.json but not handled by executeToolCall(): ${missingImpl.join(", ")}`);
    if (missingDecl.length) parts.push(`  handled by executeToolCall() but missing from ${agentType}.skills.json: ${missingDecl.join(", ")}`);
    throw new Error(parts.join("\n"));
  }
}

/** Agents that currently have a skills file. */
export function availableSkillAgents(): string[] {
  const root = assetPath(SKILLS_SUBDIR);
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .filter((f) => f.endsWith(".skills.json"))
    .map((f) => f.replace(/\.skills\.json$/, ""))
    .sort();
}
