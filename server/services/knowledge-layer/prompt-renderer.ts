import fs from "fs";
import path from "path";
import Handlebars from "handlebars";
import { aiAssetsDir, assetPath } from "./asset-path";

/**
 * Renders agent system prompts from `ai/prompts/*.hbs`.
 *
 * Templates are authored STABLE PREFIX first, DYNAMIC SUFFIX last (F3): everything
 * identical across users and turns comes first so a provider can reuse it, and the
 * per-turn values (date, memory, live data) come last.
 *
 * Content blocks are injected with triple-mustache `{{{ }}}` in the templates (F4) —
 * double-mustache would HTML-escape `&`, `<` and `"`, corrupting JSON schemas and code.
 */

const PROMPTS_SUBDIR = "prompts";
const PARTIALS_SUBDIR = "partials";
const TEMPLATE_EXT = ".hbs";

/** In dev we re-read templates so edits show up without a server restart. */
const isDev = process.env.NODE_ENV !== "production";

const templateCache = new Map<string, HandlebarsTemplateDelegate>();
let partialsRegistered = false;

function promptsDir(): string {
  return assetPath(PROMPTS_SUBDIR);
}

/** `foo.system.hbs` -> `foo.system`; nested dirs are not used for template keys. */
function keyFromFilename(filename: string): string {
  return filename.slice(0, -TEMPLATE_EXT.length);
}

function registerPartials(): void {
  const dir = path.join(promptsDir(), PARTIALS_SUBDIR);
  if (!fs.existsSync(dir)) return;

  for (const filename of fs.readdirSync(dir)) {
    if (!filename.endsWith(TEMPLATE_EXT)) continue;
    const source = fs.readFileSync(path.join(dir, filename), "utf8");
    Handlebars.registerPartial(keyFromFilename(filename), source);
  }
  partialsRegistered = true;
}

function compile(key: string, source: string): HandlebarsTemplateDelegate {
  try {
    return Handlebars.compile(source, { strict: false });
  } catch (err: any) {
    throw new Error(`[knowledge-layer] failed to compile prompt template "${key}": ${err?.message ?? err}`);
  }
}

/**
 * Compile every template once at boot so a syntax error fails startup rather than a
 * user's first query. Safe to call more than once.
 */
export function precompilePrompts(): { templates: number; partials: number } {
  templateCache.clear();
  registerPartials();

  const dir = promptsDir();
  if (!fs.existsSync(dir)) {
    throw new Error(`[knowledge-layer] prompts directory not found at ${dir}`);
  }

  for (const filename of fs.readdirSync(dir)) {
    if (!filename.endsWith(TEMPLATE_EXT)) continue;
    const key = keyFromFilename(filename);
    const source = fs.readFileSync(path.join(dir, filename), "utf8");
    templateCache.set(key, compile(key, source));
  }

  const partialCount = Object.keys((Handlebars as any).partials ?? {}).length;
  return { templates: templateCache.size, partials: partialCount };
}

export interface RenderOptions {
  /**
   * Reserved for per-tenant prompt overrides (F5). Only the file tier is implemented
   * today; accepting the parameter now means a DB override tier can be added later
   * without touching any call site.
   */
  tenantKey?: string;
}

/**
 * Render a prompt template.
 *
 * @param templateKey e.g. "procurement.system", or "contracting.edit-section" for
 *                    agents whose prompts differ per endpoint.
 */
export function renderPrompt(
  templateKey: string,
  context: Record<string, unknown> = {},
  _options: RenderOptions = {},
): string {
  // Dev: always read from disk so template edits are picked up immediately.
  if (isDev) {
    const file = path.join(promptsDir(), `${templateKey}${TEMPLATE_EXT}`);
    if (!fs.existsSync(file)) {
      throw new Error(`[knowledge-layer] no prompt template "${templateKey}" at ${file}`);
    }
    registerPartials();
    return compile(templateKey, fs.readFileSync(file, "utf8"))(context);
  }

  if (!partialsRegistered) registerPartials();

  const template = templateCache.get(templateKey);
  if (!template) {
    const known = Array.from(templateCache.keys()).sort().join(", ") || "(none loaded)";
    throw new Error(`[knowledge-layer] no prompt template "${templateKey}". Loaded templates: ${known}`);
  }
  return template(context);
}

/** Template keys currently loaded — useful for diagnostics and boot logging. */
export function loadedPromptKeys(): string[] {
  if (templateCache.size === 0 && fs.existsSync(promptsDir())) {
    return fs
      .readdirSync(promptsDir())
      .filter((f) => f.endsWith(TEMPLATE_EXT))
      .map(keyFromFilename)
      .sort();
  }
  return Array.from(templateCache.keys()).sort();
}

/** Exported for tests/diagnostics: where templates are being read from. */
export function promptsRoot(): string {
  return path.join(aiAssetsDir(), PROMPTS_SUBDIR);
}
