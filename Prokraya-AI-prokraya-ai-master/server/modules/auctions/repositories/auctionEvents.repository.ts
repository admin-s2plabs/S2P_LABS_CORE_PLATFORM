import { db } from "../../../db";
import { getContextDb } from "../../../tenant-context";
const getDb = () => getContextDb() ?? db;
import { sql, eq, asc } from "drizzle-orm";

/** Comma-separated company names for invited suppliers per auction (buyer list UI). */

export async function getInvitedSupplierNamesByEventIds(
  eventIds: number[]
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (eventIds.length === 0) return out;

  const inList = sql.join(
    eventIds.map((id) => sql`${id}`),
    sql`, `
  );
  const result = await getDb().execute(sql`
    SELECT m.eventid AS event_id, m.supp_id, s.company_name
    FROM dbo.au_auction_event_supp_mapping m
    LEFT JOIN dbo.supp_basic_org_dtls s ON s.id = m.supp_id
    WHERE m.eventid IN (${inList})
    ORDER BY m.eventid, s.company_name NULLS LAST
  `);

  const byEvent = new Map<number, string[]>();
  for (const row of result.rows as Array<{
    event_id?: number;
    supp_id?: number | null;
    company_name?: string | null;
  }>) {
    const eid = Number(row.event_id);
    if (!Number.isFinite(eid)) continue;
    const rawName = row.company_name != null ? String(row.company_name).trim() : "";
    const name =
      rawName ||
      (row.supp_id != null ? `Supplier #${row.supp_id}` : "");
    if (!name) continue;
    const list = byEvent.get(eid) ?? [];
    list.push(name);
    byEvent.set(eid, list);
  }
  byEvent.forEach((names, eid) => {
    out.set(eid, Array.from(new Set(names)).join(", "));
  });
  return out;
}

import {
  auAuctionOrderActivity,
  auctionEventTemplateColumnValues,
  auctionEvent,
  auctionEventTemplateRowMapping,
  auctionEventSuppMapping,
  auctionEventSuppWiseCap,
  auctionEventTnCMapping,
} from "@shared/schema";

// This repository is a best-effort translation of AuctionEventsRepoImpl.java into the current
// TypeScript + Drizzle/SQL stack. It assumes the underlying database tables exist with names
// close to the Java JPA entities used in the original implementation.

// NOTE: The schema is not fully known; adjust column/table names as needed.
// attribute1 must hold JSON for column defs — DB column must be TEXT (not VARCHAR(50));
// see server/db/migrations/20250327_au_auction_event_template_widen.sql

function clip(s: unknown, max: number): string | null {
  if (s == null) return null;
  const str = String(s);
  return str.length <= max ? str : str.slice(0, max);
}

export async function createEventTemplate(template: any, userName: string) {
  const defsJson =
    template?.auAuctionEventTemplateColumnDefs != null
      ? JSON.stringify(template.auAuctionEventTemplateColumnDefs)
      : null;

  if (template?.id) {
    await getDb().execute(sql`
      UPDATE dbo.au_auction_event_template
      SET
        name = ${clip(template.name, 255)},
        last_modified_by = ${clip(template.lastModifiedBy, 255)},
        last_modification_time = ${template.lastModificationTime},
        attribute1 = ${defsJson ?? template.attribute1 ?? null}
      WHERE id = ${template.id}
    `);
    return template.id;
  }

  // Some DBs have id NOT NULL without SERIAL/DEFAULT. Always supply next id explicitly.
  const result = await getDb().execute(sql`
    INSERT INTO dbo.au_auction_event_template (id, name, created_by, creation_time, last_modified_by, last_modification_time, attribute1)
    SELECT
      COALESCE((SELECT MAX(id) FROM dbo.au_auction_event_template), 0) + 1,
      ${clip(template.name, 255)},
      ${clip(userName, 255)},
      ${template.creationTime},
      ${clip(template.lastModifiedBy, 255)},
      ${template.lastModificationTime},
      ${clip(userName, 255)},
      ${defsJson}
    RETURNING id
  `);

  return result.rows?.[0]?.id;
}

export async function getAllEventTemplates() {
  const result = await getDb().execute(sql`
    SELECT *
    FROM dbo.au_auction_event_template
    ORDER BY creation_time DESC
  `);
  return result.rows;
}

export async function getEventTemplateById(id: number) {
  const result = await getDb().execute(sql`
    SELECT *
    FROM dbo.au_auction_event_template
    WHERE id = ${id}
  `);
  return result.rows?.[0] ?? null;
}

export async function createAuctionEvent(event: any) {
  if (event?.id) {
    await getDb().execute(sql`
      UPDATE dbo.au_auction_event
      SET
        name = ${event.name},
        status = ${event.status},
        start_time = ${event.startTime},
        end_time = ${event.endTime},
        created_by = ${event.createdBy},
        creation_time = ${event.creationTime},
        last_modified_by = ${event.lastModifiedBy},
        last_modification_time = ${event.lastModificationTime}
      WHERE id = ${event.id}
    `);
    return event.id;
  }

  const result = await getDb().execute(sql`
    INSERT INTO dbo.au_auction_event (
      name,
      status,
      start_time,
      end_time,
      created_by,
      creation_time,
      last_modified_by,
      last_modification_time
    )
    VALUES (
      ${event.name},
      ${event.status},
      ${event.startTime},
      ${event.endTime},
      ${event.createdBy},
      ${event.creationTime},
      ${event.lastModifiedBy},
      ${event.lastModificationTime}
    )
    RETURNING id
  `);

  return result.rows?.[0]?.id;
}

export async function getAllAuctionEvents() {
  const result = await getDb().execute(sql`
    SELECT *
    FROM dbo.au_auction_event
    ORDER BY creation_time DESC
  `);
  return result.rows;
}

export async function getAuctionEventById(id: number) {
  const rows = await getDb()
    .select()
    .from(auctionEvent)
    .where(eq(auctionEvent.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Template rows + column values + optional supp-wise caps — required for getAuctionEventDetailsById. */
export async function getTemplateRowsWithColumnValuesForEvent(eventId: number) {
  const rowMappings = await getDb()
    .select()
    .from(auctionEventTemplateRowMapping)
    .where(eq(auctionEventTemplateRowMapping.eventId, eventId))
    .orderBy(asc(auctionEventTemplateRowMapping.id));

  if (rowMappings.length === 0) return [];

  const out: any[] = [];
  for (const row of rowMappings) {
    const columnValues = await getDb()
      .select()
      .from(auctionEventTemplateColumnValues)
      .where(eq(auctionEventTemplateColumnValues.rowId, row.id))
      .orderBy(asc(auctionEventTemplateColumnValues.id));

    let suppWiseCap: any[] | undefined;
    try {
      const caps = await getDb()
        .select()
        .from(auctionEventSuppWiseCap)
        .where(eq(auctionEventSuppWiseCap.rowId, row.id));
      if (caps.length) suppWiseCap = caps;
    } catch {
      suppWiseCap = undefined;
    }

    out.push({
      ...row,
      columnValues,
      suppWiseCap,
    });
  }
  return out;
}

export async function getSuppMappingsForEvent(eventId: number) {
  return getDb()
    .select()
    .from(auctionEventSuppMapping)
    .where(eq(auctionEventSuppMapping.eventId, eventId));
}

export async function getTnCMappingsForEvent(eventId: number) {
  return getDb()
    .select()
    .from(auctionEventTnCMapping)
    .where(eq(auctionEventTnCMapping.eventId, eventId))
    .orderBy(asc(auctionEventTnCMapping.id));
}

export async function getAllActiveAuctions() {
  const result = await getDb().execute(sql`
    SELECT *
    FROM dbo.au_auction_event
    WHERE status = 'Active'
      AND start_time IS NOT NULL
      AND end_time IS NOT NULL
      AND start_time <= NOW()
      AND end_time >= NOW()
    ORDER BY start_time DESC
  `);
  return result.rows;
}

export async function getAllCompletedAuctions() {
  const result = await getDb().execute(sql`
    SELECT *
    FROM dbo.au_auction_event
    WHERE status IN ('Pending Awarded', 'Awarded', 'Withdraw', 'Cancel', 'Award Under Process', 'Partially Awarded')
    ORDER BY start_time DESC
  `);
  return result.rows;
}

export async function getAllUpcomingAuctions() {
  const result = await getDb().execute(sql`
    SELECT *
    FROM dbo.au_auction_event
    WHERE end_time > NOW() AND start_time > NOW() AND status = 'Scheduled'
    ORDER BY start_time ASC
  `);
  return result.rows;
}

export async function getAuctionsBySupplierId(supplierId: number, pageNo?: number, pageSize?: number) {
  const query = sql`
    SELECT DISTINCT eventid
    FROM dbo.au_auction_event_supp_mapping
    WHERE supp_id = ${supplierId}
  `;

  const result = await getDb().execute(query);
  return result.rows.map((row: any) => row.eventid);
}

export async function getActiveAuctionsBySupplierId(supplierId: number, pageNo?: number, pageSize?: number) {
  const baseSql = sql`
    SELECT DISTINCT auc.*
    FROM dbo.au_auction_event auc
    JOIN dbo.au_auction_event_supp_mapping sup ON sup.eventid = auc.id
    WHERE sup.supp_id = ${supplierId}
      AND auc.end_time >= NOW()
      AND auc.start_time <= NOW()
      AND auc.status = 'Active'
    ORDER BY auc.start_time DESC
  `;

  const result = await getDb().execute(baseSql);
  return result.rows;
}

export async function getCompletedAuctionsBySupplierId(supplierId: number, pageNo?: number, pageSize?: number) {
  const baseSql = sql`
    SELECT DISTINCT auc.*
    FROM dbo.au_auction_event auc
    JOIN dbo.au_auction_event_supp_mapping sup ON sup.eventid = auc.id
    WHERE sup.supp_id = ${supplierId}
      AND auc.status IN ('Pending Awarded', 'Awarded', 'Withdraw', 'Cancel', 'Award Under Process', 'Partially Awarded')
    ORDER BY auc.start_time DESC
  `;

  const result = await getDb().execute(baseSql);
  return result.rows;
}

export async function getUpcomingAuctionsBySupplierId(supplierId: number, pageNo?: number, pageSize?: number) {
  const baseSql = sql`
    SELECT DISTINCT auc.*
    FROM dbo.au_auction_event auc
    JOIN dbo.au_auction_event_supp_mapping sup ON sup.eventid = auc.id
    WHERE sup.supp_id = ${supplierId}
      AND auc.end_time > NOW()
      AND auc.start_time > NOW()
      AND auc.status = 'Scheduled'
    ORDER BY auc.start_time DESC
  `;

  const result = await getDb().execute(baseSql);
  return result.rows;
}

export async function saveDocuments(attachment: any) {
  if (attachment?.id) {
    await getDb().execute(sql`
      UPDATE dbo.au_auction_event_attachment_mapping
      SET
        attach_name = ${attachment.attachName},
        attach_path = ${attachment.attachPath},
        status = ${attachment.status},
        last_modification_time = ${attachment.lastModificationTime},
        last_modified_by = ${attachment.lastModifiedBy}
      WHERE id = ${attachment.id}
    `);
    return attachment.id;
  }

  const result = await getDb().execute(sql`
    INSERT INTO dbo.au_auction_event_attachment_mapping
      (attach_name, attach_path, row_id, creation_time, created_by, last_modification_time, last_modified_by, status)
    VALUES (
      ${attachment.attachName},
      ${attachment.attachPath},
      ${attachment.rowId},
      ${attachment.creationTime},
      ${attachment.createdBy},
      ${attachment.lastModificationTime},
      ${attachment.lastModifiedBy},
      ${attachment.status}
    )
    RETURNING id
  `);
  return result.rows?.[0]?.id;
}

export async function getDraftAuctions() {
  const result = await getDb().execute(sql`
    SELECT *
    FROM dbo.au_auction_event
    WHERE status = 'Draft'
    ORDER BY creation_time DESC
  `);
  return result.rows;
}

export async function getDraftAuctionById(auctionId: number) {
  const result = await getDb().execute(sql`
    SELECT *
    FROM dbo.au_auction_event
    WHERE id = ${auctionId}
  `);
  return result.rows?.[0] ?? null;
}

export async function deleteTemplateRows(auctionId: number, rowId: number) {
  await getDb().execute(sql`
    DELETE FROM dbo.au_auction_event_template_row_mapping
    WHERE id = ${rowId}
  `);
  return "OK";
}


export async function deleteResponse(auctionId: number, supplierId: number, id: number) {
  await getDb().execute(sql`
    DELETE FROM dbo.au_auction_event_supp_response_event
    WHERE id = ${id}
      AND auction_id = ${auctionId}
      AND supplier_id = ${supplierId}
  `);
  return "OK";
}

export async function deleteAuctionEventById(auctionId: number) {
  await getDb().execute(sql`
    UPDATE dbo.au_auction_event
    SET status = 'Deleted', last_modification_time = NOW()
    WHERE id = ${auctionId}
  `);
  return "OK";
}

export async function deleteSuppIdMapping(auctionId: number) {
  await getDb().execute(sql`
    DELETE FROM dbo.au_auction_event_supp_mapping
    WHERE eventid = ${auctionId}
  `);
  return "OK";
}

export async function getBidSummary(auctionId: number) {
  const result = await getDb().execute(sql`
    SELECT h.*,
           COALESCE(e.supp_rank, h.supp_rank) AS supp_rank
    FROM dbo.au_auction_supp_event_response_history h
    LEFT JOIN dbo.au_auction_supp_event_response e
           ON e.auction_id = h.auction_id
          AND e.supplier_id = h.supplier_id
    WHERE h.auction_id = ${auctionId}
    ORDER BY h.creation_time DESC
  `);
  return result.rows ?? [];
}

export async function awardAuction(auctionId: number, supplierId: number, awardComments: string) {
  // TODO: Implement award logic. This endpoint likely changes status and writes to award tables.
  await getDb().execute(sql`
    UPDATE dbo.au_auction_event
    SET status = 'Awarded'
    WHERE id = ${auctionId}
  `);
  return "OK";
}

export async function getAwardDetails(auctionAwardNo: number) {
  const result = await getDb().execute(sql`
    SELECT *
    FROM dbo.au_auction_supp_award_event
    WHERE award_no = ${auctionAwardNo}
  `);
  return result.rows?.[0] ?? null;
}

export async function submitAuctionAwardForApproval(auctionAwardNo: number, awardNotes: string) {
  // TODO: Implement approval workflow.
  await getDb().execute(sql`
    UPDATE dbo.au_auction_supp_award_event
    SET status = 'Pending Approval', approval_notes = ${awardNotes}
    WHERE award_no = ${auctionAwardNo}
  `);
  return "OK";
}

export async function processAwardApproval(taskId: string, result: string, comments: string, auctionAwardId: string, delegatedUser: string) {
  // TODO: Implement workflow processing based on taskId / audit.
  await getDb().execute(sql`
    UPDATE dbo.au_auction_supp_award_event
    SET status = ${result}, approval_comments = ${comments}, delegated_user = ${delegatedUser}
    WHERE award_no = ${auctionAwardId}
  `);
  return "OK";
}

export async function cancelAward(awardId: number) {
  await getDb().execute(sql`
    UPDATE dbo.au_auction_supp_award_event
    SET status = 'Cancelled'
    WHERE id = ${awardId}
  `);
  return "OK";
}

export async function getAwardApprovalHistory(awardNo: number) {
  const result = await getDb().execute(sql`
    SELECT id, object_id, approver_id, approver_name,
           status, comments, approved_date, requested_date, attribute_1
    FROM dbo.supp_regstr_appr_dtls
    WHERE object_id = ${String(awardNo)} AND attribute_1 = 'AWARD'
    ORDER BY approved_date ASC NULLS LAST, id ASC
  `);
  return result.rows ?? [];
}

export async function getCurrentApprover(auctionId: number, processName: string) {
  const result = await getDb().execute(sql`
    SELECT u.name, si.current_assignee FROM dbo.wf_step_instance si
    join dbo.wf_instance i on si.instance_id = i.id
    join dbo.um_user_dtls u on si.current_assignee = u.email_id
    where si.ref_number = ${auctionId} and si.status = 'Ready'
    and i.process_name = ${processName}`
  );
  if(result.rows.length > 0) {
  return result.rows[0];
  }
  const result2 = await getDb().execute(sql`
    SELECT si.current_assignee as name FROM dbo.wf_step_instance si
    join dbo.wf_instance i on si.instance_id = i.id
    where si.ref_number = ${auctionId} and si.status = 'Ready'
    and i.process_name = ${processName}`
  );
  if(result2.rows.length > 0) {
    return result2.rows[0];
  }
}
export async function insertAwardApprovalHistory(params: {
  awardId: string;
  approverId: number | string;
  approverName: string;
  approverEmail?: string | null;
  approverDesignation?: string | null;
  status: string;
  comments?: string | null;
}) {
  await getDb().execute(sql`
    INSERT INTO dbo.supp_regstr_appr_dtls
      ( object_id, supplier_id, comments, approver_id, approver_name,
       attribute_9, attribute_10, status, requested_date, approved_date,
       attribute_1, creation_date)
    VALUES (
      ${params.awardId},
      0,
      ${params.comments ?? null},
      ${String(params.approverId)},
      ${params.approverName},
      ${params.approverEmail ?? null},
      ${params.approverDesignation ?? null},
      ${params.status},
      NOW(), NOW(),
      'AWARD',
      NOW()
    )
  `);
}

export async function sseEmitters(_auctionId: string) {
  // SSE is normally handled in the controller layer; repository does not manage emitters.
  return null;
}

export async function auctionLineGraph(auctionId: number) {
  const result = await getDb().execute(sql`
    SELECT *
    FROM dbo.au_auction_line_graph
    WHERE auction_id = ${auctionId}
    ORDER BY "timestamp" ASC
  `);
  return result.rows;
}

export async function updateStatus() {
  // Update auctions whose end time has passed to "Pending Awarded"
  await getDb().execute(sql`
    UPDATE dbo.au_auction_event
    SET status = 'Pending Awarded', status_time = NOW()
    WHERE status = 'Active'
      AND end_time <= NOW()
  `);

  // Update scheduled auctions that have started to "Active"
  await getDb().execute(sql`
    UPDATE dbo.au_auction_event
    SET status = 'Active', status_time = NOW()
    WHERE status = 'Scheduled'
      AND start_time <= NOW()
      AND end_time >= NOW()
  `);

  // Basket auction row status updates
  await getDb().execute(sql`
    UPDATE dbo.au_auction_event_template_row_mapping
    SET basket_auction_status = 'Active'
    WHERE basket_auction_status = 'Open'
      AND start_time <= NOW()
      AND end_time >= NOW()
  `);

  await getDb().execute(sql`
    UPDATE dbo.au_auction_event_template_row_mapping
    SET basket_auction_status = 'Closed'
    WHERE basket_auction_status = 'Active'
      AND end_time <= NOW()
  `);
}

export async function getAllLocations() {
  const result = await getDb().execute(sql`
    SELECT *
    FROM dbo.am_locations_mst
  `);
  return result.rows;
}

export async function getAllAuctionAwards() {
  const result = await getDb().execute(sql`
    SELECT *
    FROM dbo.au_auction_supp_award_event
  `);
  return result.rows;
}

export async function getAuctionAwardCount(auctionId: number, status: string) {
  const result = await getDb().execute(sql`
    SELECT COUNT(*)::int AS count
    FROM dbo.au_auction_supp_award_event
    WHERE auction_id = ${auctionId}
      AND status = ${status}
  `);
  return result.rows?.[0]?.count ?? 0;
}


export const updateMinBid = async (
  mbdvalue: string,
  id: number
): Promise<number> => {
  const result = await getDb()
    .update(auctionEventTemplateColumnValues)
    .set({
      columnValue: mbdvalue,
    })
    .where(eq(auctionEventTemplateColumnValues.id, id));

  // Drizzle doesn't return affected rows directly (depends on driver)
  return result.rowCount ?? 0;
};

export async function getAuctionTemplateRows(eventId: number) {
  const result = await getDb().execute(sql`
    SELECT *
    FROM dbo.au_auction_event_template_row_mapping
    WHERE basket_auction_status IN ('Active', 'Open')
      AND eventid = ${eventId}
    ORDER BY creation_time DESC
  `);

  return result.rows;
}

export async function updateEndTimeForRowBasketDuration(
  startDate: Date,
  endDate: Date,
  id: number
) {
  const result = await getDb().execute(sql`
    UPDATE dbo.au_auction_event_template_row_mapping
    SET start_time = ${startDate},
        end_time = ${endDate}
    WHERE id = ${id}
  `);

  return result.rowCount ?? 0;
}

export async function updateEndTimeBasketDuration(
  endDate: Date,
  timeDurationForBasket: number,
  id: number
) {
  const result = await getDb().execute(sql`
    UPDATE dbo.au_auction_event
    SET end_time = ${endDate},
        basket_auction_duration = ${timeDurationForBasket}
    WHERE id = ${id}
  `);

  return result.rowCount ?? 0;
}

export async function updateEndTime(endDate: Date, id: number) {
  const result = await getDb().execute(sql`
    UPDATE dbo.au_auction_event
    SET end_time = ${endDate}
    WHERE id = ${id}
  `);

  return result.rowCount ?? 0;
}

export async function updateBidCount(
  count: number,
  id: number,
  suppResponseCount: number
) {
  const result = await getDb().execute(sql`
    UPDATE dbo.au_auction_event
    SET bids_count = ${count},
        supplier_resp_count = ${suppResponseCount}
    WHERE id = ${id}
  `);

  return result.rowCount ?? 0;
}

export async function update(data: any) {
    if (!data?.id) {
      throw new Error("ID is required for update");
    }

    const result = await getDb()
      .update(auctionEvent)
      .set(data)
      .where(eq(auctionEvent.id, data.id))
      .returning();

    return result[0];
  }
