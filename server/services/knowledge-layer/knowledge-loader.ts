import fs from "fs";
import path from "path";
import { assetPath } from "./asset-path";

/**
 * Loads curated business rules from `ai/knowledge/<domain>/*.md`.
 *
 * Static injection IS the knowledge layer for curated policy docs: the result is
 * concatenated into the prompt's STABLE PREFIX so it stays cacheable. Retrieval/RAG is
 * deliberately deferred until a single domain outgrows roughly 8K tokens.
 */

const KNOWLEDGE_SUBDIR = "knowledge";
const SHARED_DOMAIN = "shared";
const isDev = process.env.NODE_ENV !== "production";

const cache = new Map<string, string>();

export interface LoadKnowledgeOptions {
  /**
   * Reserved for per-tenant knowledge overrides (F5). Only the file tier exists today;
   * accepting it now keeps call sites stable when a DB tier is added.
   */
  tenantKey?: string;
  /** Set false to load only the domain's own files. Defaults to true. */
  includeShared?: boolean;
}

function readDomain(domain: string): string {
  const dir = assetPath(KNOWLEDGE_SUBDIR, domain);
  if (!fs.existsSync(dir)) return "";

  // Sorted for deterministic output — an unstable prefix would defeat prompt caching.
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();

  return files
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8").trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Concatenated markdown for a domain plus the shared domain.
 * Returns "" when nothing is defined, so templates can simply omit the block.
 */
export function loadKnowledge(domain: string, options: LoadKnowledgeOptions = {}): string {
  const { includeShared = true } = options;
  const cacheKey = `${domain}:${includeShared}`;

  if (!isDev) {
    const hit = cache.get(cacheKey);
    if (hit !== undefined) return hit;
  }

  const domains = includeShared && domain !== SHARED_DOMAIN ? [domain, SHARED_DOMAIN] : [domain];
  const result = domains.map(readDomain).filter(Boolean).join("\n\n");

  if (!isDev) cache.set(cacheKey, result);
  return result;
}

/** Domains that currently have a knowledge directory. */
export function availableKnowledgeDomains(): string[] {
  const root = assetPath(KNOWLEDGE_SUBDIR);
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}
