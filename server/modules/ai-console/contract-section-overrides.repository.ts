import type { Pool } from "pg";
import { pool } from "../_shared";
import { getContextPool } from "../../tenant-context";
const getPool = () => getContextPool() ?? pool;

// Each tenant has its own Postgres pool, so the "ensured" flag must be tracked
// per pool — a single module-level boolean would only ever create the table in
// whichever tenant's DB hit this first, and every other tenant would 404.
const _ensuredPools = new WeakSet<Pool>();

async function ensureSectionOverridesTable(targetPool: Pool): Promise<void> {
  if (_ensuredPools.has(targetPool)) return;
  await targetPool.query(`
    CREATE TABLE IF NOT EXISTS dbo.cm_section_overrides (
      contractrefno       bigint      NOT NULL,
      section_key         varchar(64) NOT NULL,
      html                 text       NOT NULL,
      base_fingerprint     varchar(16) NOT NULL DEFAULT '',
      created_by           varchar(255),
      creation_date         timestamp  NOT NULL DEFAULT now(),
      last_modified_by     varchar(255),
      last_modified_date   timestamp  NOT NULL DEFAULT now(),
      PRIMARY KEY (contractrefno, section_key)
    )
  `);
  _ensuredPools.add(targetPool);
}

export interface SectionOverride {
  html: string;
  base_fingerprint: string;
}

export async function getSectionOverrides(
  contractrefno: number,
  targetPool: Pool = getPool(),
): Promise<Record<string, SectionOverride>> {
  await ensureSectionOverridesTable(targetPool);
  const result = await targetPool.query(
    `SELECT section_key, html, base_fingerprint FROM dbo.cm_section_overrides WHERE contractrefno = $1`,
    [contractrefno],
  );
  const overrides: Record<string, SectionOverride> = {};
  for (const row of result.rows) {
    overrides[row.section_key] = { html: row.html, base_fingerprint: row.base_fingerprint || "" };
  }
  return overrides;
}

export async function upsertSectionOverride(
  contractrefno: number,
  sectionKey: string,
  html: string,
  baseFingerprint: string,
  userEmail: string,
  targetPool: Pool = getPool(),
): Promise<void> {
  await ensureSectionOverridesTable(targetPool);
  await targetPool.query(
    `INSERT INTO dbo.cm_section_overrides
       (contractrefno, section_key, html, base_fingerprint, created_by, last_modified_by)
     VALUES ($1, $2, $3, $4, $5, $5)
     ON CONFLICT (contractrefno, section_key)
     DO UPDATE SET html = $3, base_fingerprint = $4, last_modified_by = $5, last_modified_date = now()`,
    [contractrefno, sectionKey, html, baseFingerprint, userEmail],
  );
}

export async function bulkUpsertSectionOverrides(
  contractrefno: number,
  overrides: Record<string, SectionOverride>,
  userEmail: string,
  targetPool: Pool = getPool(),
): Promise<void> {
  const entries = Object.entries(overrides || {});
  if (entries.length === 0) return;
  await ensureSectionOverridesTable(targetPool);
  for (const [sectionKey, ov] of entries) {
    await upsertSectionOverride(contractrefno, sectionKey, ov.html, ov.base_fingerprint || "", userEmail, targetPool);
  }
}
