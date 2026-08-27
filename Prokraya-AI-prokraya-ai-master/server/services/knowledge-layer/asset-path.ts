import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Resolves the on-disk location of the `ai/` asset tree (prompts, skills, knowledge,
 * suggestions, workflows).
 *
 * Why a candidate list rather than one fixed relative path: this module sits at a
 * different depth in dev vs production.
 *   - dev (tsx, ESM):  server/services/knowledge-layer/ -> ../../../ai
 *   - prod (esbuild):  everything is bundled into dist/index.cjs -> ../ai
 * `import.meta.url` is safe in both because script/build.ts shims it for the CJS bundle.
 *
 * AI_ASSETS_DIR overrides everything, for containers that mount the tree elsewhere.
 */

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function candidates(): string[] {
  const fromEnv = process.env.AI_ASSETS_DIR;
  if (fromEnv) return [path.resolve(fromEnv)];
  return [
    path.resolve(moduleDir, "../../../ai"), // dev: repo root
    path.resolve(moduleDir, "../ai"), // prod: /app/dist -> /app/ai
    path.resolve(process.cwd(), "ai"), // dev cwd + Docker WORKDIR
  ];
}

let resolved: string | null = null;

/** Absolute path to the `ai/` tree. Resolved once, then memoised. */
export function aiAssetsDir(): string {
  if (resolved) return resolved;
  const tried = candidates();
  const found = tried.find((dir) => fs.existsSync(path.join(dir, "prompts")));
  // Fall back to the first candidate so the error thrown by assertAssetsPresent()
  // names a concrete path instead of failing on `null`.
  resolved = found ?? tried[0];
  return resolved;
}

/** Absolute path to a file inside the `ai/` tree. */
export function assetPath(...segments: string[]): string {
  return path.join(aiAssetsDir(), ...segments);
}

/**
 * Fail fast at boot if the asset tree did not ship. Without this the failure
 * surfaces as an ENOENT on a user's first agent query, which is far harder to
 * diagnose — most often because a Dockerfile is missing `COPY ai ./ai`.
 */
export function assertAssetsPresent(): void {
  const dir = aiAssetsDir();
  const required = ["prompts", "skills"];
  const missing = required.filter((sub) => !fs.existsSync(path.join(dir, sub)));

  if (!fs.existsSync(dir) || missing.length > 0) {
    const detail = missing.length ? `missing subdirector${missing.length > 1 ? "ies" : "y"}: ${missing.join(", ")}` : "directory does not exist";
    throw new Error(
      `[knowledge-layer] AI assets not found at ${dir} (${detail}).\n` +
        `Tried: ${candidates().join(", ")}\n` +
        `If this is a container, ensure the image copies the ai/ tree ` +
        `(COPY --from=builder /app/ai ./ai) or set AI_ASSETS_DIR.`,
    );
  }
}
