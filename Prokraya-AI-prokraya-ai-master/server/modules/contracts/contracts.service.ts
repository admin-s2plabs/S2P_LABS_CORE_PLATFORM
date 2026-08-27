import * as repo from "./contracts.repository";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { getContextDb } from "../../tenant-context";
const getDb = () => getContextDb() ?? db;

export async function getSections(params: { page: number; limit: number; search?: string; type?: string }) {
  return repo.getSections(params);
}

export async function getSectionById(id: number) {
  return repo.getSectionById(id);
}

export async function createSection(data: any) {
  return repo.createSection(data);
}

export async function updateSection(id: number, data: any) {
  return repo.updateSection(id, data);
}

export async function deleteSection(id: number) {
  return repo.deleteSection(id);
}

export async function getDistinctSectionTypes() {
  return repo.getDistinctSectionTypes();
}

export async function getSectionStats() {
  return repo.getSectionStats();
}

// ─── TERMS ───────────────────────────────────────────────────────────────────

export async function getTerms(params: { page: number; limit: number; search?: string; type?: string }) {
  return repo.getTerms(params);
}

export async function getTermById(id: number) {
  return repo.getTermById(id);
}

export async function createTerm(data: any) {
  return repo.createTerm(data);
}

export async function updateTerm(id: number, data: any) {
  return repo.updateTerm(id, data);
}

export async function deleteTerm(id: number) {
  return repo.deleteTerm(id);
}

export async function getDistinctTermTypes() {
  return repo.getDistinctTermTypes();
}

export async function getTermHistory(termsId: number) {
  return repo.getTermHistory(termsId);
}

/**
 * Returns contract "Under Review" tasks for the given user — this covers both the
 * pre-publish draft review ("Under Review") and the post-negotiation review
 * ("Negotiation Under Review"), since both stages reuse the same cm_approvers
 * "Review Team" rows.
 * Each row in cm_approvers where review_required='Y' and accepted_contract != 'Y'
 * and rejected_contract != 'Y' is a pending review task.
 * userId is the numeric user id from um_user_dtls.
 */
export async function getContractReviewTasks(userId: number, isSuperAdmin: boolean = false) {
  const result = await getDb().execute(sql`
    SELECT DISTINCT
      h.id AS contract_id,
      h.title,
      h.status,
      h.contr_ref_no,
      h.last_modified_date,
      h.creation_date,
      u.name AS owner_name,
      u.email_id AS owner_email_id
    FROM dbo.cm_approvers ca
    JOIN dbo.cm_header h ON h.id::text = ca.contractrefno::text
    LEFT JOIN dbo.um_user_dtls u ON u.user_name::text = h.owner::text
    WHERE h.status IN ('Under Review', 'Negotiation Under Review')
      AND LOWER(ca.teamtype) = 'review team'
      AND (ca.accepted_contract IS NULL OR ca.accepted_contract NOT IN ('Y', 'M'))
      AND (ca.rejected_contract IS NULL OR ca.rejected_contract != 'Y')
      AND (${isSuperAdmin} OR ca.user_id::text = ${String(userId)})
      AND NOT EXISTS (
      SELECT 1
      FROM dbo.cm_approvers prev_ca
      WHERE prev_ca.contractrefno::text = ca.contractrefno::text
        AND prev_ca.level < ca.level
        AND (
              prev_ca.accepted_contract IS NULL
              OR prev_ca.accepted_contract != 'Y'
            )
  )
    ORDER BY h.last_modified_date DESC NULLS LAST
  `);

  return (result.rows as any[]).map((row: any) => ({
    subject: `${row.status === 'Negotiation Under Review' ? 'Negotiation Review' : 'Contract Review'} — ${row.title || row.contr_ref_no || `Contract #${row.contract_id}`}`,
    srmsRefNumber: String(row.contract_id),
    startDate: row.last_modified_date || row.creation_date || null,
    inboxDate: row.last_modified_date || row.creation_date || null,
    lastUpdateTime: row.last_modified_date || null,
    initiator: row.owner_name || '',
    currentStatus: 'PENDING',
    taskId: `contract_review_${row.contract_id}`,
    potentialOwners: [row.owner_email_id],
    taskName: "Contract",
    lastActionDate: row.last_modified_date || null,
    lastActionBy: '',
    processInstanceId: '',
    contextSite: '',
    businessEntity: '',
    dueDate: null,
    totalRecords: 0,
    task_type: "contract_review",
  }));
}
