import { pool } from "../_shared";
import { getContextPool } from "../../tenant-context";
const getPool = () => getContextPool() ?? pool;

function stripHtml(html: string | null): string {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function autoDescription(row: any): any {
  if (row.description) return row;
  const plain = stripHtml(row.html_content);
  return { ...row, description: plain ? plain.slice(0, 200) : null };
}

export async function getSections(params: {
  page: number;
  limit: number;
  search?: string;
  type?: string;
}) {
  const { page, limit, search, type } = params;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const queryParams: any[] = [];
  let paramIndex = 1;

  // Global library: sections not bound to a specific template (template_id = 0 or NULL)
  conditions.push(`(template_id = 0 OR template_id IS NULL)`);

  if (search && search.trim()) {
    conditions.push(`(
      section_name ILIKE $${paramIndex} OR
      section_type ILIKE $${paramIndex} OR
      description ILIKE $${paramIndex}
    )`);
    queryParams.push(`%${search.trim()}%`);
    paramIndex++;
  }

  if (type && type.trim()) {
    conditions.push(`section_type = $${paramIndex}`);
    queryParams.push(type.trim());
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const countResult = await getPool().query(
    `SELECT COUNT(*) FROM dbo.cm_sections ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const dataResult = await getPool().query(
    `SELECT section_id, section_name, section_type, description, html_content,
            clause_type, clause_ammendable, clause_negotiable, clause_mandatory,
            orderby, created_by, creation_date, last_modified_by, last_modified_date
     FROM dbo.cm_sections
     ${whereClause}
     ORDER BY section_id DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...queryParams, limit, offset]
  );

  return {
    data: dataResult.rows.map(autoDescription),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getSectionById(id: number) {
  const result = await getPool().query(
    `SELECT * FROM dbo.cm_sections WHERE section_id = $1`,
    [id]
  );
  return result.rows[0] ? autoDescription(result.rows[0]) : null;
}

export async function createSection(data: {
  section_name: string;
  section_type?: string;
  description?: string;
  html_content?: string;
  clause_ammendable?: string;
  clause_negotiable?: string;
  clause_mandatory?: string;
  orderby?: number;
  created_by?: string;
}) {
  const idResult = await getPool().query(
    `SELECT COALESCE(MAX(section_id), 380000000) + 1 AS next_id FROM dbo.cm_sections`
  );
  const newId = idResult.rows[0].next_id;

  const result = await getPool().query(
    `INSERT INTO dbo.cm_sections
       (section_id, section_name, section_type, description, html_content,
        clause_ammendable, clause_negotiable, clause_mandatory, orderby,
        template_id, created_by, creation_date, last_modified_by, last_modified_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,NOW(),$10,NOW())
     RETURNING *`,
    [
      newId,
      data.section_name,
      data.section_type || "Custom",
      data.description || null,
      data.html_content || null,
      data.clause_ammendable || "No",
      data.clause_negotiable || "No",
      data.clause_mandatory || "No",
      data.orderby || null,
      data.created_by || "system",
    ]
  );
  return result.rows[0];
}

export async function updateSection(id: number, data: {
  section_name?: string;
  section_type?: string;
  description?: string;
  html_content?: string;
  clause_ammendable?: string;
  clause_negotiable?: string;
  clause_mandatory?: string;
  orderby?: number;
  last_modified_by?: string;
}) {
  const result = await getPool().query(
    `UPDATE dbo.cm_sections SET
       section_name = COALESCE($2, section_name),
       section_type = COALESCE($3, section_type),
       description = $4,
       html_content = $5,
       clause_ammendable = COALESCE($6, clause_ammendable),
       clause_negotiable = COALESCE($7, clause_negotiable),
       clause_mandatory = COALESCE($8, clause_mandatory),
       orderby = $9,
       last_modified_by = $10,
       last_modified_date = NOW()
     WHERE section_id = $1
     RETURNING *`,
    [
      id,
      data.section_name || null,
      data.section_type || null,
      data.description !== undefined ? data.description : null,
      data.html_content !== undefined ? data.html_content : null,
      data.clause_ammendable || null,
      data.clause_negotiable || null,
      data.clause_mandatory || null,
      data.orderby !== undefined ? data.orderby : null,
      data.last_modified_by || "system",
    ]
  );
  return result.rows[0] || null;
}

export async function deleteSection(id: number) {
  const result = await getPool().query(
    `DELETE FROM dbo.cm_sections WHERE section_id = $1 RETURNING section_id`,
    [id]
  );
  return result.rowCount && result.rowCount > 0;
}

// ─── TERMS ───────────────────────────────────────────────────────────────────

export async function getTerms(params: {
  page: number;
  limit: number;
  search?: string;
  type?: string;
}) {
  const { page, limit, search, type } = params;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const queryParams: any[] = [];
  let paramIndex = 1;

  if (search && search.trim()) {
    conditions.push(`(
      terms_name ILIKE $${paramIndex} OR
      term_type ILIKE $${paramIndex} OR
      description ILIKE $${paramIndex}
    )`);
    queryParams.push(`%${search.trim()}%`);
    paramIndex++;
  }

  if (type && type !== "all") {
    conditions.push(`term_type = $${paramIndex}`);
    queryParams.push(type);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await getPool().query(
    `SELECT COUNT(*) FROM dbo.cm_terms ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const dataResult = await getPool().query(
    `SELECT terms_id, terms_name, term_type, description, term_details,
            status, version, term_amendable, term_negotiable, mandatory,
            terms_department, terms_department_name,
            created_by, creation_date, last_modified_by, last_modified_date
     FROM dbo.cm_terms
     ${whereClause}
     ORDER BY terms_id DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...queryParams, limit, offset]
  );

  return {
    data: dataResult.rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getTermById(id: number) {
  const result = await getPool().query(
    `SELECT * FROM dbo.cm_terms WHERE terms_id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function createTerm(data: {
  terms_name: string;
  term_type?: string;
  description?: string;
  term_details?: string;
  status?: string;
  term_amendable?: string;
  term_negotiable?: string;
  mandatory?: string;
  terms_department?: string;
  terms_department_name?: string;
  created_by?: string;
}) {
  const idResult = await getPool().query(`SELECT COALESCE(MAX(terms_id), 0) + 1 AS next_id FROM dbo.cm_terms`);
  const newId = idResult.rows[0].next_id;
  const now = new Date();

  await getPool().query(
    `INSERT INTO dbo.cm_terms (
       terms_id, terms_name, term_type, description, term_details,
       status, version, term_amendable, term_negotiable, mandatory,
       terms_department, terms_department_name,
       created_by, creation_date, last_modified_by, last_modified_date
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      newId,
      data.terms_name,
      data.term_type || null,
      data.description || null,
      data.term_details || null,
      data.status || "Draft",
      1,
      data.term_amendable || "No",
      data.term_negotiable || "No",
      data.mandatory || "No",
      data.terms_department || null,
      data.terms_department_name || null,
      data.created_by || null,
      now,
      data.created_by || null,
      now,
    ]
  );
  return newId;
}

export async function updateTerm(
  id: number,
  data: {
    terms_name?: string;
    term_type?: string;
    description?: string;
    term_details?: string;
    status?: string;
    term_amendable?: string;
    term_negotiable?: string;
    mandatory?: string;
    terms_department?: string;
    terms_department_name?: string;
    last_modified_by?: string;
  }
) {
  const existing = await getTermById(id);
  if (!existing) return false;

  // Only save history snapshot when the term is NOT in Draft
  // Draft terms can be edited freely without version tracking
  if (existing.status !== "Draft") {
    const histIdResult = await getPool().query(`SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM dbo.cm_terms_history`);
    const histId = histIdResult.rows[0].next_id;
    await getPool().query(
      `INSERT INTO dbo.cm_terms_history (
         id, terms_id, terms_name, term_type, description, term_details,
         status, version, term_amendable, term_negotiable, mandatory,
         terms_department, terms_department_name,
         created_by, creation_date, last_modified_by, last_modified_date
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        histId, existing.terms_id, existing.terms_name, existing.term_type,
        existing.description, existing.term_details, existing.status,
        existing.version, existing.term_amendable, existing.term_negotiable,
        existing.mandatory, existing.terms_department, existing.terms_department_name,
        existing.created_by, existing.creation_date,
        existing.last_modified_by, existing.last_modified_date,
      ]
    );
  }

  // Update main record
  const now = new Date();
  const result = await getPool().query(
    `UPDATE dbo.cm_terms SET
       terms_name = $1, term_type = $2, description = $3, term_details = $4,
       status = $5, version = version + 1,
       term_amendable = $6, term_negotiable = $7, mandatory = $8,
       terms_department = $9, terms_department_name = $10,
       last_modified_by = $11, last_modified_date = $12
     WHERE terms_id = $13`,
    [
      data.terms_name ?? existing.terms_name,
      data.term_type ?? existing.term_type,
      data.description !== undefined ? (data.description ?? null) : existing.description,
      data.term_details !== undefined ? (data.term_details ?? "") : existing.term_details,
      data.status ?? existing.status,
      data.term_amendable ?? existing.term_amendable,
      data.term_negotiable ?? existing.term_negotiable,
      data.mandatory ?? existing.mandatory,
      data.terms_department ?? existing.terms_department,
      data.terms_department_name ?? existing.terms_department_name,
      data.last_modified_by || null,
      now,
      id,
    ]
  );
  return result.rowCount && result.rowCount > 0;
}

export async function deleteTerm(id: number) {
  const result = await getPool().query(`DELETE FROM dbo.cm_terms WHERE terms_id = $1`, [id]);
  return result.rowCount && result.rowCount > 0;
}

export async function getDistinctTermTypes() {
  const result = await getPool().query(`
    SELECT DISTINCT term_type
    FROM dbo.cm_terms
    WHERE term_type IS NOT NULL AND term_type <> ''
    ORDER BY term_type
  `);
  return result.rows.map((r) => r.term_type as string);
}

export async function getTermHistory(termsId: number) {
  const result = await getPool().query(
    `SELECT * FROM dbo.cm_contracts_terms_hst WHERE contr_term_id = $1 ORDER BY action_date DESC`,
    [termsId]
  );
  return result.rows;
}

// ─── SECTIONS ─────────────────────────────────────────────────────────────────

export async function getDistinctSectionTypes() {
  const result = await getPool().query(`
    SELECT DISTINCT section_type
    FROM dbo.cm_sections
    WHERE (template_id = 0 OR template_id IS NULL) AND section_type IS NOT NULL AND section_type <> ''
    ORDER BY section_type
  `);
  return result.rows.map((r) => r.section_type as string);
}

export async function getSectionStats() {
  const result = await getPool().query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE section_type = 'Custom') AS custom,
      COUNT(*) FILTER (WHERE section_type = 'Standard') AS standard,
      COUNT(*) FILTER (WHERE section_type NOT IN ('Custom','Standard') OR section_type IS NULL) AS other
    FROM dbo.cm_sections
    WHERE (template_id = 0 OR template_id IS NULL)
  `);
  const r = result.rows[0];
  return {
    total: parseInt(r.total, 10),
    custom: parseInt(r.custom, 10),
    standard: parseInt(r.standard, 10),
    other: parseInt(r.other, 10),
  };
}
