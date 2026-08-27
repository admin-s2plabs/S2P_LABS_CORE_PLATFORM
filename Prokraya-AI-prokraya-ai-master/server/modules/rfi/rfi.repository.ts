import { pool } from "../_shared";
import { getContextPool } from "../../tenant-context";

const getPool = () => getContextPool() ?? pool;

export interface InviteSupplierInput {
  supplier_id: string | number;
  supplier_name: string;
  supplier_site?: string;
  supplier_contact?: string;
  supplier_contact_email?: string;
  supplier_contact_no?: string;
}

export async function listCampaigns() {
  const result = await getPool().query(`
    SELECT c.id, c.campaign_code, c.title, c.status, c.deadline, c.source_pr_number,
           c.created_by, c.creation_time, c.last_modified_by, c.last_modification_time,
           c.published_time, c.closed_time,
           COUNT(s.id)::int AS supplier_count,
           COUNT(*) FILTER (WHERE s.status = 'responded')::int AS responded_count
    FROM dbo.rfi_campaigns c
    LEFT JOIN dbo.rfi_campaign_suppliers s ON s.campaign_id = c.id
    GROUP BY c.id
    ORDER BY c.id DESC
  `);
  return result.rows;
}

export async function getCampaignRow(id: number) {
  const result = await getPool().query(
    `SELECT c.id, c.campaign_code, c.title, c.description, c.status, c.deadline, c.source_pr_number,
            c.created_by, c.creation_time, c.last_modified_by, c.last_modification_time,
            c.published_time, c.closed_time,
            COUNT(s.id)::int AS supplier_count,
            COUNT(*) FILTER (WHERE s.status = 'responded')::int AS responded_count
     FROM dbo.rfi_campaigns c
     LEFT JOIN dbo.rfi_campaign_suppliers s ON s.campaign_id = c.id
     WHERE c.id = $1
     GROUP BY c.id`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function insertCampaign(data: {
  title: string;
  description: string;
  deadline: string;
  sourcePrNumber: string | null;
  createdBy: string;
}) {
  const result = await getPool().query(
    `INSERT INTO dbo.rfi_campaigns
       (title, description, status, deadline, source_pr_number, created_by, creation_time, last_modified_by, last_modification_time)
     VALUES ($1, $2, 'draft', $3, $4, $5, now(), $5, now())
     RETURNING *`,
    [data.title, data.description, data.deadline, data.sourcePrNumber, data.createdBy],
  );
  return result.rows[0];
}

export async function setCampaignCode(id: number, campaignCode: string) {
  await getPool().query(`UPDATE dbo.rfi_campaigns SET campaign_code = $1 WHERE id = $2`, [
    campaignCode,
    id,
  ]);
}

export async function updateCampaignRow(
  id: number,
  data: { title: string; description: string; deadline: string; lastModifiedBy: string },
) {
  const result = await getPool().query(
    `UPDATE dbo.rfi_campaigns
     SET title = $1, description = $2, deadline = $3, last_modified_by = $4, last_modification_time = now()
     WHERE id = $5
     RETURNING *`,
    [data.title, data.description, data.deadline, data.lastModifiedBy, id],
  );
  return result.rows[0] ?? null;
}

export async function deleteCampaignRow(id: number) {
  const result = await getPool().query(`DELETE FROM dbo.rfi_campaigns WHERE id = $1 RETURNING id`, [id]);
  return result.rows[0] ?? null;
}

export async function setCampaignStatus(
  id: number,
  status: "published" | "closed",
  lastModifiedBy: string,
) {
  const timeColumn = status === "published" ? "published_time" : "closed_time";
  const result = await getPool().query(
    `UPDATE dbo.rfi_campaigns
     SET status = $1, ${timeColumn} = now(), last_modified_by = $2, last_modification_time = now()
     WHERE id = $3
     RETURNING *`,
    [status, lastModifiedBy, id],
  );
  return result.rows[0] ?? null;
}

export async function listCampaignsForSupplier(supplierId: string) {
  const result = await getPool().query(
    `SELECT c.id, c.campaign_code, c.title, c.description, c.status, c.deadline,
            s.status AS supplier_status, s.creation_time AS invited_time
     FROM dbo.rfi_campaign_suppliers s
     JOIN dbo.rfi_campaigns c ON c.id = s.campaign_id
     WHERE s.supplier_id = $1 AND c.status IN ('published', 'closed')
     ORDER BY c.id DESC`,
    [supplierId],
  );
  return result.rows;
}

export async function listCampaignSuppliers(campaignId: number) {
  const result = await getPool().query(
    `SELECT * FROM dbo.rfi_campaign_suppliers WHERE campaign_id = $1 ORDER BY id ASC`,
    [campaignId],
  );
  return result.rows;
}

export async function insertCampaignSuppliers(
  campaignId: number,
  suppliers: InviteSupplierInput[],
  createdBy: string,
) {
  const inserted: any[] = [];
  for (const s of suppliers) {
    const result = await getPool().query(
      `INSERT INTO dbo.rfi_campaign_suppliers
         (campaign_id, supplier_id, supplier_name, supplier_email, supplier_contact,
          status, created_by, creation_time, last_modified_by, last_modification_time)
       VALUES ($1, $2, $3, $4, $5, 'invited', $6, now(), $6, now())
       ON CONFLICT (campaign_id, supplier_id) DO NOTHING
       RETURNING *`,
      [
        campaignId,
        String(s.supplier_id),
        s.supplier_name,
        s.supplier_contact_email ?? null,
        s.supplier_contact ?? s.supplier_name,
        createdBy,
      ],
    );
    if (result.rows[0]) inserted.push(result.rows[0]);
  }
  return inserted;
}

export async function deleteCampaignSupplier(campaignId: number, supplierId: string) {
  await getPool().query(
    `DELETE FROM dbo.rfi_campaign_suppliers WHERE campaign_id = $1 AND supplier_id = $2`,
    [campaignId, supplierId],
  );
  await getPool().query(
    `DELETE FROM dbo.rfi_responses_dtls WHERE campaign_id = $1 AND supplier_id = $2`,
    [campaignId, supplierId],
  );
}

export async function setSupplierShortlist(
  campaignId: number,
  supplierId: string,
  isShortlisted: boolean,
) {
  const result = await getPool().query(
    `UPDATE dbo.rfi_campaign_suppliers
     SET is_shortlisted = $1, last_modification_time = now()
     WHERE campaign_id = $2 AND supplier_id = $3
     RETURNING *`,
    [isShortlisted, campaignId, supplierId],
  );
  return result.rows[0] ?? null;
}

export async function markSupplierResponded(campaignId: number, supplierId: string) {
  await getPool().query(
    `UPDATE dbo.rfi_campaign_suppliers
     SET status = 'responded', last_modification_time = now()
     WHERE campaign_id = $1 AND supplier_id = $2 AND status <> 'responded'`,
    [campaignId, supplierId],
  );
}

export async function listQuestions(campaignId: number) {
  const result = await getPool().query(
    `SELECT * FROM dbo.rfi_questions_dtls WHERE campaign_id = $1 ORDER BY display_order ASC, id ASC`,
    [campaignId],
  );
  return result.rows;
}

export async function insertQuestion(data: {
  campaignId: number;
  libraryId: string | null;
  attributeKey: string;
  questionText: string;
  questionType: string;
  options: string[] | null;
  required: boolean;
  source: "library" | "custom";
  createdBy: string;
}) {
  const orderResult = await getPool().query(
    `SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM dbo.rfi_questions_dtls WHERE campaign_id = $1`,
    [data.campaignId],
  );
  const nextOrder = orderResult.rows[0].next_order;

  const result = await getPool().query(
    `INSERT INTO dbo.rfi_questions_dtls
       (campaign_id, library_id, attribute_key, question_text, question_type, options,
        required, source, display_order, created_by, creation_time)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     RETURNING *`,
    [
      data.campaignId,
      data.libraryId,
      data.attributeKey,
      data.questionText,
      data.questionType,
      data.options ? JSON.stringify(data.options) : null,
      data.required,
      data.source,
      nextOrder,
      data.createdBy,
    ],
  );
  return result.rows[0];
}

export async function updateQuestionRow(
  questionId: number,
  data: {
    questionText?: string;
    questionType?: string;
    options?: string[] | null;
    required?: boolean;
  },
) {
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (data.questionText !== undefined) {
    sets.push(`question_text = $${i++}`);
    params.push(data.questionText);
  }
  if (data.questionType !== undefined) {
    sets.push(`question_type = $${i++}`);
    params.push(data.questionType);
  }
  if (data.options !== undefined) {
    sets.push(`options = $${i++}`);
    params.push(data.options ? JSON.stringify(data.options) : null);
  }
  if (data.required !== undefined) {
    sets.push(`required = $${i++}`);
    params.push(data.required);
  }
  if (!sets.length) return getQuestionRow(questionId);
  params.push(questionId);
  const result = await getPool().query(
    `UPDATE dbo.rfi_questions_dtls SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    params,
  );
  return result.rows[0] ?? null;
}

export async function getQuestionRow(questionId: number) {
  const result = await getPool().query(`SELECT * FROM dbo.rfi_questions_dtls WHERE id = $1`, [questionId]);
  return result.rows[0] ?? null;
}

export async function deleteQuestionRow(questionId: number) {
  const result = await getPool().query(
    `DELETE FROM dbo.rfi_questions_dtls WHERE id = $1 RETURNING id, campaign_id`,
    [questionId],
  );
  if (result.rows[0]) {
    await getPool().query(`DELETE FROM dbo.rfi_responses_dtls WHERE question_id = $1`, [questionId]);
  }
  return result.rows[0] ?? null;
}

export async function listResponses(campaignId: number) {
  const result = await getPool().query(
    `SELECT * FROM dbo.rfi_responses_dtls WHERE campaign_id = $1 ORDER BY submitted_time ASC`,
    [campaignId],
  );
  return result.rows;
}

export async function listResponsesForSupplier(campaignId: number, supplierId: string) {
  const result = await getPool().query(
    `SELECT * FROM dbo.rfi_responses_dtls WHERE campaign_id = $1 AND supplier_id = $2 ORDER BY submitted_time ASC`,
    [campaignId, supplierId],
  );
  return result.rows;
}

export async function upsertResponse(data: {
  campaignId: number;
  supplierId: string;
  questionId: number;
  answerValue: string | null;
  submittedBy: string;
}) {
  const result = await getPool().query(
    `INSERT INTO dbo.rfi_responses_dtls
       (campaign_id, supplier_id, question_id, answer_value, submitted_by, submitted_time,
        created_by, creation_time, last_modified_by, last_modification_time)
     VALUES ($1, $2, $3, $4, $5, now(), $5, now(), $5, now())
     ON CONFLICT (campaign_id, supplier_id, question_id)
     DO UPDATE SET answer_value = EXCLUDED.answer_value, submitted_by = EXCLUDED.submitted_by,
                   submitted_time = now(), last_modified_by = EXCLUDED.submitted_by, last_modification_time = now()
     RETURNING *`,
    [data.campaignId, data.supplierId, data.questionId, data.answerValue, data.submittedBy],
  );
  return result.rows[0];
}
