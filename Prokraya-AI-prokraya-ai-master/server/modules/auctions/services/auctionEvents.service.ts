import * as repo from "../repositories/auctionEvents.repository";
import { db } from "../../../db";
import { getContextDb } from "../../../tenant-context";
const getDb = () => getContextDb() ?? db;
import * as repo1 from "../../procurement/procurement.repository";
import { auAuctionBroadCastMessage, auAuctionOrderActivity, AuAuctionOrderActivity, 
  auctionEventTemplateRowMapping, auctionEvent, auctionEventSuppMapping,
   AuctionEventSuppMapping, auctionEventTemplateColumnValues, 
   InsertAuctionEventTemplateColumnValues, AuctionEventTemplateRowMapping, 
   auctionEventSuppWiseCap, InsertAuctionEventSuppWiseCap, 
   InsertAuctionEventSuppMapping, auctionSuppResponseEvent, auctionSuppResponseRow, 
  auctionSuppAwardEvent,  auctionSuppAwardEventRow , auctionSuppAwardEventTemplateColumnValues,
  auctionSuppEventResponseTemplateColumnValues, auctionSuppResponseEventHistory,  
  auctionSuppResponseRowHistory, auctionSuppResponseColumnValuesHistory,
  AuAuctionSuppResponseEvent,
  auctionEventTnCMapping,
} from "@shared/schema";
import { workflowService } from "../../../services/workflowService";
   import {
  AuctionEventTemplate,
  AuctionEventDetails,
  AuctionSuppResponseEvent,
  AuctionBroadCastMessage,
  AuctionExtendTimeRemain,
  AuctionMinBidDiff,
  AuctionWithdraw,
  AuctionPartialAward,
  AuctionAwardDTO,
  AwardBidHeaderDTO,
} from "../types/auctionEvents.types";
import dayjs from "dayjs";
import * as auctionOrderActivityrepo from "../repositories/auctionOrderActivity.repository";
import * as auctionBroadCastMessageRepo from "../repositories/auctionBroadCastMessage.repository";
import * as auctionEventResponseRepo from "../repositories/auctionEventResponse.repository";
import { auctionEventResponseHistoryRepo } from "../repositories/auctionEventResponseHistory.repository";
import * as helperUtils from "../../_shared/helper-utils";
import * as vendorService from "../../vendors/vendors.service";
import * as adminMgmtService from "../../administration/administration.service";
import * as srmUserMgmtService from "../../user-management/user-management.service";
import * as wfService from "../../../services/workflowService";
import { eventBus } from "../../../services/eventBus";
import { EventTypes, WorkflowTaskAssignedEvent } from "../../../services/eventBus/events";
import { publishTaskAssignmentEvent } from "../../../services/eventBus/publishTaskAssignment";
// import { suppRegApprRepo } from "../vendor-registration/vendor-register-appr-hst.repository";
import { auctionEventAwardRepo } from "../repositories/auctionEventAward.repository";
import * as auctionEventResponseRowRepo from "../repositories/auctionEventResponseRow.repository";
import { logAudit } from "../../administration/administration.service";


import { fromPath } from "pdf2pic";
import { productCategorizationService }from "../../../services/product-categorization-service";

import { request, type Request } from "express";
import { eq, and, inArray, sql, getTableColumns } from "drizzle-orm";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import * as adminRepo from "../../../modules/administration/administration.repository.ts";

function formatIstDateTime(date: Date | string | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function audit(req: any, auditKey: string, auditAction: string, auditMessage: string, module: string) {
  const user = (req as any).user;
  logAudit({
    auditKey,
    auditAction,
    auditMessage,
    fullName: user?.name || "System",
    userId: user?.id || "system",
    module,
  }).catch((err: any) => console.error("[Audit] Failed to log:", err?.message));
}

/** Postgres rejects '' for numeric/integer/bigint; multipart clients often send "". */
const AUCTION_EVENT_PG_NUMBER_KEYS = new Set([
  "templateId",
  "orgId",
  "auctionDuration",
  "ifBidInLastMinutesInMins",
  "acutiontTimeExtensionInMins",
  "supplierRespCount",
  "noOfBids",
  "basketAuctionDuration",
  "awardAmount",
  "awardedAmount",
]);

/**
 * INSERT with explicit `id` via nextval so legacy DBs work even when `id` has no DEFAULT
 * (omitting `id` would insert NULL and violate NOT NULL).
 * Sequences must exist and be aligned (run server/db/migrations/auctions_database_updates.sql).
 */
function buildInsertAuctionEventSql(insertValues: Record<string, unknown>) {
  const tableCols = getTableColumns(auctionEvent);
  const entries: Array<{ name: string; value: unknown }> = [];
  for (const [key, col] of Object.entries(tableCols)) {
    if (key === "id") continue;
    const v = insertValues[key];
    if (v === undefined) continue;
    entries.push({ name: (col as { name: string }).name, value: v });
  }
  if (entries.length === 0) {
    throw new Error("createAuctionEvent: no columns to insert");
  }
  const colSql = sql.join(
    [sql.identifier("id"), ...entries.map((e) => sql.identifier(e.name))],
    sql`, `
  );
  const valSql = sql.join(
    [
      sql`nextval('dbo.au_auction_event_id_seq'::regclass)`,
      ...entries.map((e) => sql`${e.value}`),
    ],
    sql`, `
  );
  return sql`
    INSERT INTO dbo.au_auction_event (${colSql})
    VALUES (${valSql})
    RETURNING id
  `;
}

export async function createEventTemplate(eventTemplate: AuctionEventTemplate, user: any) {
  const userName = user?.user_name || user.email_id;
  return repo.createEventTemplate(eventTemplate, userName);
}

export async function getAllEventTemplates() {
  return repo.getAllEventTemplates();
}

export async function getEventTemplateById(id: number) {
  return repo.getEventTemplateById(id);
}

export async function createAuctionEvent(
  payload: any,
  buyerDocs: any[],
  suppDocs: any[],
  user: any,
  orgId?: string | number | null
){
 return await getDb().transaction(async (tx) => {
    const now = new Date();

    const rawEventId = (payload as Record<string, unknown>).id;
    const parsedEventId = Number(rawEventId);
    const validUpdateId =
      rawEventId != null &&
      rawEventId !== "" &&
      rawEventId !== "0" &&
      rawEventId !== "null" &&
      Number.isFinite(parsedEventId) &&
      parsedEventId > 0;
    if (!validUpdateId) {
      delete (payload as Record<string, unknown>).id;
    }

    let event = null;

    // 🔹 Update case (only when client sends a real numeric id)
    if (validUpdateId) {
      const [existing] = await tx
        .select()
        .from(auctionEvent)
        .where(eq(auctionEvent.id, parsedEventId));

      event = existing;
    }

    // 🔹 Delivery date validation
    if (payload.deliveryDateStr) {
      const deliveryDate = new Date(payload.deliveryDateStr);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (deliveryDate < today) {
        return 0;
      }

      payload.deliveryDate = deliveryDate;
    }

    // 🔹 Start Time
    let startTime = Date.now();

    if (payload.startDateStr) {
      const parsed = new Date(payload.startDateStr);
      payload.startTime = parsed;
      startTime = parsed.getTime();
    } else {
      payload.startTime = new Date();
    }

    // 🔹 Duration Calculation (end_time required for "live" queries; 0/missing → 1 unit minimum)
    const durationNum = Number(payload.auctionDuration);
    const effectiveDuration =
      Number.isFinite(durationNum) && durationNum > 0 ? durationNum : 1;
    payload = auctionDurationCalc(
      payload,
      startTime,
      effectiveDuration,
      payload.isBasket
    );

    // 🔹 Audit fields
    payload.createdBy = event?.createdBy || user.email;
    payload.creationTime = event?.creationTime || now;
    payload.lastModifiedBy = user?.email;
    payload.lastModificationTime = now;

    // 🔹 Org id — client rarely sends this; fall back to the logged-in user's org
    // so downstream approval-notification lookups (entityId → org filter) resolve.
    if (payload.orgId == null || payload.orgId === "") {
      payload.orgId = event?.orgId ?? orgId;
    }

    // 🔹 Validate rows
    if (!payload.templateRows || payload.templateRows.length === 0) {
      return 0;
    }

    // 🔥 Basket Logic (IMPORTANT)
    let timeBasketDuration = 0;
    let timeDuration = 0;

    for (const row of payload.templateRows) {
      if (payload.isBasket === "Y") {
        row.basketAuctionStatus = "Open";

        if (payload.auctionDuration !== 0) {
          let timeToAdd = startTime || Date.now();

          if (timeBasketDuration !== 0) {
            row.startTime = new Date(timeBasketDuration);
            timeDuration += payload.auctionDuration;
          } else {
            row.startTime = new Date(timeToAdd);
            timeDuration = payload.auctionDuration;
          }

          switch (payload.auctionDurationUnits) {
            case "Mins":
              timeToAdd += timeDuration * 60 * 1000;
              break;
            case "Hrs":
              timeToAdd += timeDuration * 60 * 60 * 1000;
              break;
            case "Days":
              timeToAdd += timeDuration * 24 * 60 * 60 * 1000;
              break;
          }

          timeBasketDuration = timeToAdd;
          row.endTime = new Date(timeBasketDuration);
        }
      }

      // audit fields
      row.createdBy = event?.createdBy || user;
      row.creationTime = event?.creationTime || now;
      row.lastModifiedBy = user;
      row.lastModificationTime = now;

      // column values
      for (const col of row.columnValues || []) {
        col.createdBy = user;
        col.creationTime = now;
        col.lastModifiedBy = user;
        col.lastModificationTime = now;
      }
    }
    // 🔹 Delete old supplier mapping (update case)
    if (validUpdateId) {
      await tx
        .delete(auctionEventSuppMapping)
        .where(eq(auctionEventSuppMapping.eventId, parsedEventId));
      await tx
        .delete(auctionEventTnCMapping)
        .where(eq(auctionEventTnCMapping.eventId, parsedEventId));
    }

    // 🔹 Supplier mapping
    const suppMappings = (payload.suppIds || []).map((s: AuctionEventSuppMapping) => ({
      ...s,
      sent: true,
      createdBy: user,
      creationTime: now,
    }));

    const normalizedTncIds = ((payload.tncIds as any[]) || [])
      .map((t: any) => Number(t?.tncId ?? t?.id ?? t))
      .filter((n: number) => Number.isFinite(n) && n > 0);

    // Persist selected T&C ids in attribute15 for environments without event<->tnc relation mapping.
    if ((payload as Record<string, unknown>).tncIds !== undefined) {
      payload.attribute15 = JSON.stringify(normalizedTncIds);
    }

    // 🔹 Insert or Update Event — only real table columns; never pass id (or API-only keys) so SERIAL DEFAULT applies
    const {
      templateRows: _templateRows,
      suppIds: _suppIds,
      startDateStr: _startDateStr,
      deliveryDateStr: _deliveryDateStr,
      tncIds: _tncIds,
      id: _omitEventId,
      ...eventInsert
    } = payload;

    const tableCols = getTableColumns(auctionEvent);
    const eventValues: Record<string, unknown> = {};
    const src = eventInsert as Record<string, unknown>;
    for (const key of Object.keys(tableCols)) {
      if (key === "id") continue;
      let v = src[key];
      if (v === undefined) continue;
      if (v === "" && AUCTION_EVENT_PG_NUMBER_KEYS.has(key)) v = null;
      eventValues[key] = v;
    }

    let eventId: number;

    if (validUpdateId) {
      // UPDATE existing draft auction record
      await tx
        .update(auctionEvent)
        .set(eventValues as any)
        .where(eq(auctionEvent.id, parsedEventId));
      eventId = parsedEventId;

      // Delete existing template rows so they can be re-inserted fresh
      const existingRows = await tx
        .select({ id: auctionEventTemplateRowMapping.id })
        .from(auctionEventTemplateRowMapping)
        .where(eq(auctionEventTemplateRowMapping.eventId, parsedEventId));

      for (const existingRow of existingRows) {
        await tx
          .delete(auctionEventTemplateColumnValues)
          .where(eq(auctionEventTemplateColumnValues.rowId, existingRow.id));
        await tx
          .delete(auctionEventSuppWiseCap)
          .where(eq(auctionEventSuppWiseCap.rowId, existingRow.id));
      }

      await tx
        .delete(auctionEventTemplateRowMapping)
        .where(eq(auctionEventTemplateRowMapping.eventId, parsedEventId));
    } else {
      const insertResult = await tx.execute(buildInsertAuctionEventSql(eventValues));
      const row0 = insertResult.rows?.[0] as { id?: number } | undefined;
      const newId = row0?.id;
      if (newId == null || Number.isNaN(Number(newId))) {
        throw new Error("createAuctionEvent: insert did not return id");
      }
      eventId = Number(newId);
    }

    // 🔹 Insert Rows (explicit id via nextval — legacy DBs often lack DEFAULT on id)
    for (const row of payload.templateRows) {
      const { columnValues, suppWiseCap, id: _omitRowId, ...rowMapping } = row as any;
      if (rowMapping.savingsAmount === "") rowMapping.savingsAmount = null;
      const [savedRow] = await tx
        .insert(auctionEventTemplateRowMapping)
        .values({
          id: sql`nextval('dbo.au_auction_event_template_row_mapping_id_seq'::regclass)`,
          ...rowMapping,
          eventId,
        })
        .returning();

      // 🔹 Insert column values
      if (columnValues?.length) {
        await tx.insert(auctionEventTemplateColumnValues).values(
          columnValues.map((c: InsertAuctionEventTemplateColumnValues) => {
            const { id: _omitColId, ...cv } = c as Record<string, unknown>;
            return {
              id: sql`nextval('dbo.au_auction_event_template_column_values_id_seq'::regclass)`,
              ...cv,
              rowId: savedRow.id,
            };
          })
        );
      }

      if (suppWiseCap?.length) {
        await tx.insert(auctionEventSuppWiseCap).values(
          suppWiseCap.map((cap: any) => ({
            id: sql`nextval('dbo.au_auction_event_supp_wise_cap_id_seq'::regclass)`,
            rowId: savedRow.id,
            suppId: cap.suppId,
            supplierName: cap.supplierName ?? "",
            price: cap.price != null ? String(cap.price) : "0",
            createdBy: user,
            lastModifiedBy: user,
            creationTime: now,
            lastModificationTime: now,
          }))
        );
      }
    }

    // 🔹 Insert supplier mappings
    if (suppMappings.length) {
      await tx.insert(auctionEventSuppMapping).values(
        suppMappings.map((s: AuctionEventSuppMapping) => {
          const { id: _omitSuppMapId, ...rest } = s as Record<string, unknown>;
          return {
            id: sql`nextval('dbo.au_auction_event_supp_mapping_id_seq'::regclass)`,
            ...rest,
            eventId,
          };
        })
      );
    }
    // 🔹 Insert TnC mappings
    if (payload.tncIds?.length) {
      await tx.insert(auctionEventTnCMapping).values(
        payload.tncIds.map((tnc: any) => ({
          // always generate fresh mapping ids on insert
          id: sql`nextval('dbo.au_auction_event_tnc_mapping_id_seq'::regclass)`,
          ...(Object.fromEntries(
            Object.entries(tnc).filter(([k]) => k !== "id")
          ) as Record<string, unknown>),
          eventId,
          createdBy: tnc.id != null ? (event?.createdBy ?? user) : user,
          creationTime: tnc.id != null ? (event?.creationTime ?? now) : now,
          lastModificationTime: now,
          lastModifiedBy: user,
        }))
      );
    }

    // 🔹 Activity log
    await updateAuctionOrderActivity(
      eventId,
      validUpdateId ? `Auction Published: ${payload.name}` : `Auction Created: ${payload.name}`,
      user
    );
    const orgData = await adminRepo.getOrgDetails();
    // Trigger AUCTION_PUBLISHED notification
    if (payload.status === "Scheduled" || payload.status === "Active") {
      for (const mapping of suppMappings) {
        try {
          const s = await vendorService.getDboSupplier(mapping.suppId);
          if (s && s.emailId) {
            eventBus.publish({
              eventType: EventTypes.AUCTION_PUBLISHED,
              timestamp: new Date(),
              vendorName: s.companyName || "Vendor",
              auctionId: String(eventId),
              auctionType:payload.auctionType,
              auctionName: payload.name || "Auction",
              startTime: formatIstDateTime(payload.startTime),
              endTime: formatIstDateTime(payload.endTime),
              receiverEmail: s.emailId,
                ccEmail:payload.createdBy,
              orgLogoPath: orgData.org_logo_path,
              domain: (user as any)?.domain
            });
          }
        } catch (err) {
          console.error(`[Auction] Failed to trigger published event for supplier ${mapping.suppId}:`, err);
        }
      }
    }

    // 🔹 Attachments handling (simplified)
    for (const row of payload.templateRows) {
      if (row.buyerDocsMapping && buyerDocs.length) {
        let buyerDocsString = row.buyerDocsMapping();
let buyerDocsDtls: any[] = buyerDocsString.split("~");
let buyerDocsList: any[] = buyerDocsDtls[1].split(",");
        await processEventAttachments(
          eventId,
          row,
          "BUYER_DOCS",
          buyerDocsList,
          buyerDocs
        );
      }

      if (row.suppDocsMapping && suppDocs.length) {
         let suppDocsString = row.suppDocsMapping();
let suppDocsDtls: any[] = suppDocsString.split("~");
let suppDocsList: any[] = suppDocsDtls[1].split(",");
        await processEventAttachments(
          eventId,
          row,
          "SUPP_DOCS",
          suppDocsList,
          suppDocs
        );
      }
    }

    return eventId;
  });
}


export const auctionDurationCalc = (
  event: any,
  startTime: number,
  duration: number,
  isBasket?: string
) => {
  let timeToAdd = startTime || Date.now();
  const isBasketEnabled = isBasket?.toLowerCase() === "y";
  const count = event.templateRows?.length || 0;

  if (isBasketEnabled && count > 0) {
    duration *= count;
  }

  const unitMultiplier: Record<string, number> = {
    Mins: 60 * 1000,
    Hrs: 60 * 60 * 1000,
    Days: 24 * 60 * 60 * 1000,
  };

  timeToAdd += duration * (unitMultiplier[event.auctionDurationUnits] || 0);

  event.endTime = new Date(timeToAdd);

  if (isBasketEnabled && count > 0) {
    event.basketAuctionDuration = duration;
  }

  return event;
};

export const processEventAttachments = async (
  eventId: number,
  row: any,
  docSource: string,
  docsList: string[],
  docs: Express.Multer.File[]
) => {
  try {
    for (const doc of docs) {
      for (const docFromList of docsList) {
        if (doc.originalname === docFromList) {
          await uploadDocument(eventId, row, docSource, doc);
        }
      }
    }
  } catch (err) {
    console.error("Error processing attachments:", err);
  }
};

export const uploadDocument = async (
  eventId: number,
  row: any,
  docSource: string,
  doc: Express.Multer.File
) => {
  try {
    if (!doc || !doc.buffer) return;

    const rootPath = process.env.DOCS_DIR || "uploads";

    // 🔥 Tenant handling (simplified)
    const tenant = "development"; // replace with service call if needed

    const dirPath = path.join(
      rootPath,
      tenant,
      "AUCTIONS",
      String(eventId),
      docSource,
      String(row.id)
    );

    // create directory
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // 🔥 file name
    const fileName = `${Date.now()}_${doc.originalname}`;
    const uploadPath = path.join(dirPath, fileName);

    // write file
    fs.writeFileSync(uploadPath, doc.buffer);

    // 🔥 Create mapping object
    const auctionDocMapping: any = {
      attachName: doc.originalname,
      attachPath: uploadPath,
      rowId: row.id,
      creationTime: new Date(),
      createdBy: "SYSTEM", // replace with user
      lastModificationTime: new Date(),
      lastModifiedBy: "SYSTEM",
      status: "Active",
      docThumbnail: null,
    };

    // 🔥 Thumbnail generation
    const ext = path.extname(doc.originalname).toLowerCase();

    if (ext === ".pdf") {
      // 👉 Node PDF thumbnail (simplified)
      // Use libraries like: pdf-poppler / pdf-thumbnail

      try {
        // Placeholder (you can integrate real lib)
        auctionDocMapping.docThumbnail = null;
      } catch (err) {
        console.error("PDF thumbnail error:", err);
      }
    } else {
      // Image thumbnail (sharp)
      try {
        const thumbnail = await sharp(doc.buffer)
          .resize(200, 200)
          .toBuffer();

        auctionDocMapping.docThumbnail = thumbnail;
      } catch (err) {
        console.error("Image thumbnail error:", err);
      }
    }

    // 🔥 Attach to row (like JPA list)
    if (!row.eventAttachments) {
      row.eventAttachments = [];
    }

    row.eventAttachments.push(auctionDocMapping);

    // 👉 OPTIONAL: persist immediately using Drizzle
    // await getDb().insert(auctionEventAttachmentMapping).values(auctionDocMapping);

  } catch (err) {
    console.error("Upload document error:", err);
  }
};

export async function getAllAuctionEvents() {
  return repo.getAllAuctionEvents();
}

export async function getAuctionEventById(id: number) {
  return repo.getAuctionEventById(id);
}

export async function getAllActiveAuctions() {
  return repo.getAllActiveAuctions();
}

/** Maps raw `au_auction_event` rows to the buyer list UI shape in `auctions.tsx` (DboAuction). */
export function mapAuctionEventRowForBuyerList(row: Record<string, unknown>): Record<string, unknown> {
  const r = row as Record<string, any>;
  const at = String(r.auction_type ?? "");
  let typeKey = "Reverse";
  if (at.includes("Forward")) typeKey = "Forward";
  else if (at.includes("Dutch")) typeKey = "Dutch";
  else if (at.includes("English")) typeKey = "English";

  return {
    ...r,
    auctionTitle: r.name ?? "",
    auctionNumber: String(r.id ?? ""),
    type: typeKey,
    status: r.status ?? "",
    startDate: r.start_time ? new Date(r.start_time).toISOString() : null,
    endDate: r.end_time ? new Date(r.end_time).toISOString() : null,
    createdDate: r.creation_time ? new Date(r.creation_time).toISOString() : null,
    prNumber: r.pr_number ?? "",
    buyerName: r.created_by ?? "",
    departmentName: "",
    buyer: r.created_by ?? "",
    description: "",
    currency: r.currency ?? "USD",
    createdBy: r.created_by ?? "",
    lastUpdatedBy: r.last_modified_by ?? null,
    lastUpdatedDate: r.last_modification_time
      ? new Date(r.last_modification_time).toISOString()
      : null,
    auctionAmount: 0,
    awardAmount: Number(r.award_amount ?? r.awarded_amount ?? 0) || 0,
    noInvitedSupps: 0,
    auctionAcknowledges: 0,
    auctionResponses: 0,
    requestorName: r.created_by ?? "",
    deliverToLocation: "",
    paymentTerms: "",
    invitedSupplierNames: "",
  };
}

export async function attachSupplierNamesToBuyerListRows(
  rows: unknown[]
): Promise<unknown[]> {
  const ids = rows
    .map((r) => Number((r as Record<string, unknown>).id))
    .filter((n) => Number.isFinite(n));
  const nameMap = await repo.getInvitedSupplierNamesByEventIds(ids);
  return rows.map((row) => {
    const base = mapAuctionEventRowForBuyerList(row as Record<string, unknown>);
    const id = Number((row as Record<string, unknown>).id);
    return {
      ...base,
      invitedSupplierNames: nameMap.get(id) ?? "",
    };
  });
}

/** Buyer UI — aligns with client queryKey `/api/auctionEvents/getLiveAuctions` */
export async function getLiveAuctions() {
  await repo.updateStatus();
  const rows = await repo.getAllActiveAuctions();
  return attachSupplierNamesToBuyerListRows(rows);
}

/** Buyer UI — `/api/auctionEvents/getScheduledAuctions` */
export async function getScheduledAuctions() {
  await repo.updateStatus();
  const rows = await repo.getAllUpcomingAuctions();
  return attachSupplierNamesToBuyerListRows(rows);
}

/** Buyer UI — `/api/auctionEvents/getClosedAuctions` */
export async function getClosedAuctions() {
  await repo.updateStatus();
  const rows = await repo.getAllCompletedAuctions();
  return attachSupplierNamesToBuyerListRows(rows);
}

export async function getAllCompletedAuctions() {
  return repo.getAllCompletedAuctions();
}

export async function getAllUpcomingAuctions() {
  // Optionally update auction statuses based on current time before fetching
  await repo.updateStatus();
  return repo.getAllUpcomingAuctions();
}

export async function getCurrentApprover(auctionId: number, processName: string) {
  return repo.getCurrentApprover(auctionId, processName);
}

export async function getAuctionsBySupplierId(supplierId: number, pageNo?: number, pageSize?: number) {
  return repo.getAuctionsBySupplierId(supplierId, pageNo, pageSize);
}

export const getAuctionEventDetailsById = async (id: number) => {
  await repo.updateStatus();

  const baseEvent = await getAuctionEventById(id);
  if (!baseEvent) return null;

  const [templateRows, suppMappings, tncMappings] = await Promise.all([
    repo.getTemplateRowsWithColumnValuesForEvent(id),
    repo.getSuppMappingsForEvent(id),
    repo.getTnCMappingsForEvent(id),
  ]);

  const event: Record<string, any> = {
    ...baseEvent,
    templateRows,
    suppIds: suppMappings,
    tncIds: tncMappings,
  };

  let eventDetails: any = {
    name: event.name,
    id: event.id,
    orgId: event.orgId,
    createdBy: event.createdBy,
    lastModifiedBy: event.lastModifiedBy,
    creationTime: event.creationTime,
    lastModificationTime: event.lastModificationTime,
    templateId: event.templateId,
    auctionType: event.auctionType,
    auctionStrategy: event.auctionStrategy,
    allotmentType: event.allotmentType,
    auctionDuration: event.auctionDuration,
    auctionDurationUnits: event.auctionDurationUnits,
    auctionSavingMeasure: event.auctionSavingMeasure,
    auctionSavingReference: event.auctionSavingReference,
    auctionSavingReferenceValue: event.auctionSavingReferenceValue,
    acutiontTimeExtensionInMins: event.acutiontTimeExtensionInMins,
    startTime: event.startTime,
    endTime: event.endTime,
    deliveryDate: event.deliveryDate,
    ifBidInLastMinutesInMins: event.ifBidInLastMinutesInMins,
    currency: event.currency,
    status: event.status,
    statusTime: event.statusTime,
    auctionWithdraw: event.isAuctionWithdraw ?? event.auctionWithdraw,
    auctionWithdrawReason: event.auctionWithdrawReason,
    broadCastMsg: event.broadCastMessage,
    isBasket: event.isBasket,
    isScheduledEvent: event.isScheduledEvent,
    prNumber: event.prNumber,
    supplierRespCount: event.supplierRespCount,
    noOfBids: event.noOfBids,
    awardAccepted: event.awardAccepted,
    awardAcceptedDate: event.awardAcceptedDate,
    approversList: event.approversList,
    cancelReason: event.cancelReason,
    awardAmount: event.awardAmount,
    awardedAmount: event.awardedAmount,
    ifBidInLastMinutesInMinsUnit:
      event.ifBidInLastMinutesInMinsUnits,
    acutiontTimeExtensionInMinsUnit:
      event.acutiontTimeExtensionInMinsUnits,
    basketAuctionDuration: event.basketAuctionDuration,
    attribute1: event.attribute1,
    attribute2: event.attribute2,
    attribute3: event.attribute3,
    attribute4: event.attribute4,
    attribute5: event.attribute5,
    serverDate: new Date(),
  };

  // 1️⃣ ORG DETAILS
  try {
    eventDetails.orgDetails = await resolveAuctionOrgDetails(event.orgId);
  } catch (e) {
    console.error(e);
  }

  // 2️⃣ SUPPLIER DETAILS
  try {
    const suppList = (event.suppIds as any[]) || [];
    eventDetails.auctionEventSuppMapping = suppList;

    const suppIds = suppList
      .map((s: any) => s?.suppId ?? s?.supp_id)
      .filter((id) => id != null && Number.isFinite(Number(id)));
    if (suppIds.length) {
      eventDetails.suppIds = await vendorService.getSupplierByIds(suppIds);
    } else {
      eventDetails.suppIds = [];
    }
  } catch (e) {
    console.error(e);
  }

  // 3️⃣ TNCs
  try {
    const tncIds = await extractTncIds(event, id);
    if (tncIds.length) {
      eventDetails.tncs =
        await adminMgmtService.getTermsAndConditionsByIds(tncIds);
    }
  } catch (e) {
    console.error(e);
  }

  // 4️⃣ RESPONSES + LOT LEADING PRICE
  let lotLeadingPrice: any = null;

  const responses =
    await auctionEventResponseRepo.findByAuctionId(id);

  if (responses?.length) {
    eventDetails.auAuctionSuppResponseEventList = await Promise.all(
      responses.map(async (r) => {
        const rid = Number((r as { id?: unknown }).id);
        if (!Number.isFinite(rid) || rid <= 0) return r;
        const full = await getDb().query.auctionSuppResponseEvent.findFirst({
          where: eq(auctionSuppResponseEvent.id, rid),
          with: {
            templateResponseRows: {
              with: {
                columnResponseValues: true,
              },
            },
          },
        });
        if (!full?.templateResponseRows) return r;
        return {
          ...(r as Record<string, unknown>),
          templateResponseRows: full.templateResponseRows,
        };
      })
    );

    const enrichedResponses = eventDetails.auAuctionSuppResponseEventList as any[];

    if (responses.length > 1) {
      if (event.auctionType === "Reverse Auction") {
        lotLeadingPrice =
          await auctionEventResponseRepo.findLotLeadingPrice(id);
      } else {
        lotLeadingPrice =
          await auctionEventResponseRepo.findLotLeadingPriceForwardAuction(
            id
          );
      }

      // Enrich lotLeadingPrice with per-row templateResponseRows
      if (lotLeadingPrice) {
        const enriched = enrichedResponses?.find(
          (r: any) => Number(r.id) === Number(lotLeadingPrice.id)
        );
        if (enriched) lotLeadingPrice = enriched;
      }

      eventDetails.lotLeadingPrice =
        lotLeadingPrice?.auctionTotal && Number(lotLeadingPrice.auctionTotal) > 0
          ? String(lotLeadingPrice.auctionTotal)
          : "0";
    } else {
      const val: number = Number(responses[0].auctionTotal) ?? 0;
      eventDetails.lotLeadingPrice = String(val);

      // Use the enriched version so templateResponseRows are available
      if (val > 0) lotLeadingPrice = enrichedResponses?.[0] ?? responses[0];
    }
  }

  // 5️⃣ AWARDS
  try {
    const awards =
      await auctionEventAwardRepo.findByAuctionId(id);
    if (awards?.length) {
      eventDetails.awardEvent = awards;
    }
  } catch (e) {
    console.error(e);
  }

  let eventTemplate: any = null;
  if (event.templateId != null) {
    try {
      eventTemplate = normalizeAuctionTemplateForDetails(
        await getEventTemplateById(Number(event.templateId))
      );
    } catch (e) {
      console.error("[getAuctionEventDetailsById] event template load failed", e);
    }
  }

  // 6️⃣ TEMPLATE ROWS
  const rowMapping = event.templateRows as any[] || [];

  if (rowMapping.length) {
    const locations = await adminMgmtService.getLocations();
    const columnDefs =
      (eventTemplate?.auAuctionEventTemplateColumnDefs as any[]) || [];

    const auctionRows: any[] = [];

    for (const mapping of rowMapping.sort(
      (a: any, b: any) => a.id - b.id
    )) {
      const row: any = {
        auRowId: mapping.id,
        suppWiseCap: mapping.suppWiseCap,
        startTime: mapping.startTime,
        endTime: mapping.endTime,
        basketAuctionStatus: mapping.basketAuctionStatus,
        auctionEventRowColumn: [],
        savingsAmount: mapping.savingsAmount,
      };

      let productLeadingPrice: number  = 0;

      // 🔥 LEADING PRICE LOGIC
      if (
        ["Rank Auction", "Partial Based"].includes(
          event.allotmentType as string
        )
      ) {
        let grossPrice: number =
          event.auctionType === "Reverse Auction"
            ? Number(await auctionEventResponseRowRepo.findByAuRowId(
                mapping.id
              ))
            : Number(await auctionEventResponseRowRepo.findByAuRowIdForwardAuction(
                mapping.id
              ));

        if (grossPrice) {
          productLeadingPrice = grossPrice;
          row.leadingPrice = String(grossPrice);

          const rrp =
            await auctionEventResponseRowRepo.findSuppRespRowByLeadPrice(
              grossPrice,
              mapping.id
            );
          const rrpAny = rrp as Record<string, unknown> | null | undefined;
          const rawParentId =
            rrp?.auSuppEventRespId ?? rrpAny?.au_supp_event_resp_id;
          const parentRespId = Number(rawParentId);
          if (Number.isFinite(parentRespId) && parentRespId > 0) {
            const parentRows = await auctionEventResponseRepo.findById(parentRespId);
            const parent = parentRows?.[0] as { supplierName?: string } | undefined;
            row.supplierName = parent?.supplierName;
          }
        }
      } else if (event.allotmentType === "Lot Based") {
        const match =
          lotLeadingPrice?.templateResponseRows?.find(
            (r: any) => Number(r.auRowId) === Number(mapping.id)
          );

        if (match?.lineItemTotal) {
          productLeadingPrice = Number(match.lineItemTotal);
          row.leadingPrice = String(match.lineItemTotal);
          row.supplierName =
            match.auSuppEventRespId?.supplierName;
        }
      }

      // 🔥 LINE ITEM SAVINGS CALCULATION
      if (event.auctionSavingMeasure === "Line Item") {
        const savRef = Number(row.savingsAmount);
        const leadPrice = productLeadingPrice;
        if (savRef > 0 && leadPrice > 0) {
          const saving = savRef - leadPrice;
          row.savingsLineItemPrice = saving;
          row.savingsLineItemPercentage = (saving / savRef) * 100;
        }
      }

      // 🔥 COLUMN LOOP
      for (const columnDef of columnDefs) {
        const columnValues = mapping.columnValues || [];

        const rowColumn: any = {
          columnId: columnDef.columnId,
          columnKey: columnDef.columnName,
          editableBy: columnDef.editableBy,
          viewedBy: columnDef.viewedBy,
        };

        if (columnDef.columnName === "Item Name") {
          const rawItemValue = getValueForKey(
            columnValues,
            columnDef.columnId
          );
          const itemValue = rawItemValue != null ? String(rawItemValue).trim() : "";

          // Accept both legacy item-id payloads and newer item-name payloads.
          if (itemValue) {
            const productId = Number(itemValue);
            if (Number.isFinite(productId) && productId > 0) {
              const productRows =
                await productCategorizationService.getProductDetailsById(productId);
              const product = Array.isArray(productRows) ? productRows[0] : productRows;
              if (product) {
                rowColumn.columnValue = product.productName ?? itemValue;
                row.productSpecification = product.productSpecification;
              } else {
                rowColumn.columnValue = itemValue;
              }
            } else {
              rowColumn.columnValue = itemValue;
            }
          }
        } else if (
          columnDef.columnName === "Delivery Location"
        ) {
          rowColumn.columnValue = getValueForKeyLocation(
            locations,
            getValueForKey(columnValues, columnDef.columnId)
          );
        } else {
          rowColumn.columnValue = getValueForKey(
            columnValues,
            columnDef.columnId
          );
        }

        row.auctionEventRowColumn.push(rowColumn);
      }

      auctionRows.push(row);
    }

    // 🔥 SAVINGS CALCULATION
    if (event.auctionSavingMeasure === "Gross Item") {
      const grossBudget = Number(event.auctionSavingReference);
      const lotTotal = Number(eventDetails.lotLeadingPrice ?? 0);
      if (grossBudget > 0 && lotTotal > 0) {
        const saving = grossBudget - lotTotal;
        eventDetails.savingsPrice = saving;
        eventDetails.savingsPercentage = (saving / grossBudget) * 100;
      }
    } else {
      let totalSavings = 0;
      let totalPercentage = 0;

      for (const r of auctionRows) {
        if (r.savingsLineItemPrice && r.savingsLineItemPercentage) {
          totalSavings += r.savingsLineItemPrice;
          totalPercentage += r.savingsLineItemPercentage;
        }
      }

      if (totalSavings) eventDetails.savingsPrice = totalSavings;

      if (totalPercentage && auctionRows.length) {
        eventDetails.savingsPercentage =
          totalPercentage / auctionRows.length;
      }
    }

    eventDetails.templateRows = auctionRows;
  }

  // 7️⃣ TEMPLATE DEF
  try {
    eventDetails.templateDef = eventTemplate;
  } catch (e) {
    console.error(e);
  }
//
  // 8️⃣ SSE
  // const emitter = emitters.get(id.toString());

  // if (emitter) {
  //   try {
  //     emitter.write(
  //       `event: AuctionDetails\ndata: ${JSON.stringify(
  //         eventDetails
  //       )}\n\n`
  //     );
  //   } catch (e) {
  //     console.error(e);
  //   }
  // }

  return eventDetails;
};

// need to work 
export async function getAllAuctionRespEvents() {
  return null;
}

/** Top-level response fields only — safe for `res.json` (no relation cycles). */
export function plainSuppResponseForApi(
  row: Record<string, unknown> | null | undefined
) {
  if (!row) return null;
  return {
    id: row.id,
    auctionId: row.auctionId,
    supplierId: row.supplierId,
    auctionTotal: row.auctionTotal,
    auctionName: row.auctionName,
    supplierName: row.supplierName,
    status: row.status,
    suppRank: row.suppRank,
    bidTime: row.bidTime,
    creationTime: row.creationTime,
    lastModificationTime: row.lastModificationTime,
    createdBy: row.createdBy,
  };
}

const SUPP_RESP_ROW_ID_SEQ = sql`nextval('dbo.au_auction_supp_event_response_row_id_seq'::regclass)`;
const SUPP_RESP_COL_VAL_ID_SEQ = sql`nextval('dbo.au_auction_supp_event_response_template_column_values_id_seq'::regclass)`;

function toNumericDbString(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (s.toUpperCase() === "N/A" || s.toUpperCase() === "NA") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return s;
}

/**
 * `auctionEventResponseRepo.save` only persists the response header; line items and
 * template column values must be written here so `getAuctionEventDetailsBySupp` can
 * hydrate `templateResponseRows` + `columnResponseValues`.
 */
async function persistAuctionSuppTemplateRows(
  headerId: number,
  templateRows: any[] | undefined,
  event: { templateId?: unknown },
  user: string,
  now: Date
): Promise<void> {
  if (!headerId || !templateRows?.length) return;

  const templateIdStr =
    event.templateId != null && event.templateId !== ""
      ? String(event.templateId)
      : null;

  const existingDbRows = await getDb()
    .select()
    .from(auctionSuppResponseRow)
    .where(eq(auctionSuppResponseRow.auctionSuppRespId, headerId));

  const existingSnapshot = existingDbRows.map((r) => ({
    id: r.id,
    auctionSuppRespId: r.auctionSuppRespId,
    auRowId: r.auRowId,
  }));

  for (const row of templateRows) {
    const cols = row.columnResponseValues;
    if (!Array.isArray(cols)) {
      // Basket flow appends raw SQL rows without column payloads — leave DB row as-is.
      continue;
    }

    const auRowId = Number(row.auRowId ?? row.au_row_id);
    if (!Number.isFinite(auRowId)) continue;

    const lineTotal = toNumericDbString(row.lineItemTotal ?? row.line_item_total);
    const lineBase = toNumericDbString(
      row.lineItemBasePrice ?? row.line_item_base_price
    );

    let dbRowId = resolvePersistRowDbId(row, headerId, existingSnapshot);

    if (dbRowId != null) {
      await getDb()
        .update(auctionSuppResponseRow)
        .set({
          lineItemTotal: lineTotal,
          lineItemBasePrice: lineBase,
          suppProductRank:
            row.suppProductRank ?? row.supp_product_rank ?? null,
          savingsAmount:
            row.savingsAmount != null && row.savingsAmount !== ""
              ? String(row.savingsAmount)
              : null,
          basketAuctionStatus:
            row.basketAuctionStatus ?? row.basket_auction_status ?? null,
          templateId: templateIdStr,
          lastModifiedBy: user,
          lastModificationTime: now,
        })
        .where(eq(auctionSuppResponseRow.id, dbRowId));

      await getDb()
        .delete(auctionSuppEventResponseTemplateColumnValues)
        .where(
          eq(
            auctionSuppEventResponseTemplateColumnValues.auctionSuppRespRowId,
            dbRowId
          )
        );

      await insertSuppRespColumnValues(dbRowId, cols, user, now);
      continue;
    }

    const suppRespRowInsert = {
      id: SUPP_RESP_ROW_ID_SEQ,
      auctionSuppRespId: headerId,
      auRowId,
      templateId: templateIdStr,
      lineItemTotal: lineTotal,
      lineItemBasePrice: lineBase,
      suppProductRank: row.suppProductRank ?? null,
      savingsAmount:
        row.savingsAmount != null && row.savingsAmount !== ""
          ? String(row.savingsAmount)
          : null,
      basketAuctionStatus: row.basketAuctionStatus ?? null,
      createdBy: user,
      creationTime: now,
      lastModifiedBy: user,
      lastModificationTime: now,
    } as unknown as typeof auctionSuppResponseRow.$inferInsert;

    const [inserted] = await getDb()
      .insert(auctionSuppResponseRow)
      .values(suppRespRowInsert)
      .returning();

    if (inserted?.id) {
      existingSnapshot.push({
        id: inserted.id,
        auctionSuppRespId: headerId,
        auRowId,
      });
      await insertSuppRespColumnValues(inserted.id, cols, user, now);
    }
  }
}

function resolvePersistRowDbId(
  row: any,
  headerId: number,
  existingRows: {
    id: number;
    auctionSuppRespId: number | null;
    auRowId: number | null;
  }[]
): number | undefined {
  const auRowId = Number(row.auRowId ?? row.au_row_id);
  const rawId = row.id;
  if (rawId != null && rawId !== "") {
    const n = Number(rawId);
    if (Number.isFinite(n) && n > 0) {
      const hit = existingRows.find(
        (r) =>
          r.id === n && Number(r.auctionSuppRespId) === Number(headerId)
      );
      if (hit) return hit.id;
    }
  }
  const byAu = existingRows.find(
    (r) =>
      Number(r.auctionSuppRespId) === Number(headerId) &&
      r.auRowId != null &&
      Number(r.auRowId) === auRowId
  );
  return byAu?.id;
}

async function insertSuppRespColumnValues(
  rowId: number,
  cols: any[],
  user: string,
  now: Date
): Promise<void> {
  if (!cols.length) return;

  const rows = cols
    .map((col) => {
      const columnId = col.columnId ?? col.column_id;
      if (columnId == null || columnId === "") return null;
      return {
        id: SUPP_RESP_COL_VAL_ID_SEQ,
        auctionSuppRespRowId: rowId,
        columnId: String(columnId),
        columnKey: col.columnKey ?? col.column_key ?? null,
        columnValue: col.columnValue ?? col.column_value ?? null,
        suppRspColumnValue:
          col.suppRspColumnValue ??
          col.supp_rsp_column_value ??
          col.suppRspColumn ??
          col.supp_rsp_column ??
          null,
        createdBy: user,
        creationTime: now,
        lastModifiedBy: user,
        lastModificationTime: now,
      };
    })
    .filter(Boolean);

  if (!rows.length) return;

  await getDb().insert(auctionSuppEventResponseTemplateColumnValues).values(
    rows as unknown as (typeof auctionSuppEventResponseTemplateColumnValues.$inferInsert)[]
  );
}

export async function createAuctionSuppRespEvents(respEvent: AuAuctionSuppResponseEvent
  , user: string, files?: Express.Multer.File[]) {
  if (!respEvent?.auctionId || !respEvent?.supplierId) {
    return respEvent;
  }
   type AuctionResponsePayload = typeof respEvent & {
  templateResponseRows?: any[];
  };
  const payload: AuctionResponsePayload = respEvent;

  try {
   
    const now = new Date();
    const loggedInUser = user;

    // 🔥 1. Normalize Base Price (BigDecimal → JS)
    payload.templateResponseRows = payload.templateResponseRows?.map((row: any) => {
      if (row.lineItemBasePrice != null) {
        row.lineItemBasePrice = Math.floor(row.lineItemBasePrice * 100) / 100;
      }
      return row;
    });

    // 🔥 2. Fetch Existing Data
    const existingResp =
      await auctionEventResponseRepo.findByAuctionIdAndSupplierId(
        payload.auctionId as number,
        payload.supplierId as number
      );

    const auction = await getAuctionEventById(payload.auctionId as number);
    type auctionWithRelations = typeof auction & { templateRows?: any[] };
    const event: auctionWithRelations = auction;
    const supplier = await vendorService.getDboSupplier(
      payload.supplierId as number
    );

    if (!event || !supplier) {
      return (
        plainSuppResponseForApi(null) ?? {
          auctionId: payload.auctionId,
          supplierId: payload.supplierId,
          skipped: true,
        }
      );
    }

    const hasExistingValidBid =
      existingResp &&
      existingResp.auctionTotal &&
      Number(existingResp.auctionTotal) !== 0;

    // 🔥 3. Validation (same as Java logic)
    if (
      (!existingResp || !hasExistingValidBid) ||
      event.isBasket === "Y"
    ) {
      // 🔥 Basket override ID
      if (event.isBasket === "Y" && existingResp) {
        payload.id = existingResp.id;
        // Increment bid count from existing record; don't reset to 1 on every round.
        payload.attribute1 = (existingResp.attribute1 as number ?? 0) + 1;
      } else {
        payload.attribute1 = 1;
      }

      // 🔥 Populate response info
      auctionSuppRespInfo(payload, event, supplier, now);

      payload.creationTime = now;
      payload.createdBy = loggedInUser;
      payload.lastModificationTime = now;
      payload.lastModifiedBy = loggedInUser;

      const auRowIds: number[] = [];
      let basketRowId: number | null = null;

      // 🔥 4. Process Rows
      for (const row of payload.templateResponseRows as any[]) {
        auRowIds.push(row.auRowId);

        row.createdBy = loggedInUser;
        row.creationTime = now;
        row.lastModificationTime = now;
        row.lastModifiedBy = loggedInUser;
        row.auSuppEventRespId = payload;

        const rowMapping = event.templateRows?.find(
          (r: any) => r.id === row.auRowId
        );

        if (rowMapping) {
          row.savingsAmount = rowMapping.savingsAmount;
          row.basketAuctionStatus = rowMapping.basketAuctionStatus;
        }

        for (const col of row.columnResponseValues || []) {
          col.createdBy = loggedInUser;
          col.creationTime = now;
          col.lastModifiedBy = loggedInUser;
          col.lastModificationTime = now;
          col.auSuppEventRespRowId = row;
        }

        basketRowId = row.auRowId;
      }

      // 🔥 5. Basket Logic
      if (event.isBasket === "Y") {
        try {
          const existingRows =
            await auctionEventResponseRowRepo.findRespRowByAuRowId(
              payload.id,
              auRowIds
            );

          if (existingRows?.length) {
            payload.templateResponseRows?.push(...existingRows);
          }
        } catch {}
      }

      // 🔥 6. Save
      const saved =
        await auctionEventResponseRepo.save(payload);

      await persistAuctionSuppTemplateRows(
        Number(saved.id),
        payload.templateResponseRows,
        event,
        loggedInUser,
        now
      );

      // 🔥 7. Activity Log
      const msg =
        payload.placeProxy === "Y"
          ? `Auction Response submitted through Proxy for Supplier :${payload.supplierName}`
          : `Auction Response submitted by Supplier :${payload.supplierName}`;

      await updateAuctionOrderActivity(event.id as number, msg, loggedInUser);
      const orgData = await adminRepo.getOrgDetails();
      const auctionBuyer = await srmUserMgmtService.getLoggedInUser(auction.createdBy?.trim() || "");
      // Trigger notifications for quote submission
      try {
        if (payload.placeProxy === "Y") {
          eventBus.publish({
            eventType: EventTypes.PROXY_BID_PLACED,
            timestamp: new Date(),
            vendorName: supplier.companyName || "Vendor",
            auctionId: String(event.id),
            amount: String(saved.auctionTotal),
            linkUrl: `${process.env.FRONTEND_URL}/auctions/${event.id}`,
            receiverEmail: supplier.emailId || "",
            orgLogoPath: orgData.org_logo_path
          });
        } else {
           // Notify buyer/user
           eventBus.publish({
             eventType: EventTypes.SUPP_AUCTION_QUOTE_SUBMITTED,
             timestamp: new Date(),
             userName: auctionBuyer.name || "Buyer",
             auctionId: String(event.id),
             vendorName: supplier.companyName || "Vendor",
               auctionType: event.auctionType || "",
               auctionName: event.name || "Auction",
               domain: (user as any)?.domain,
             receiverEmail: event.createdBy || "",
             orgLogoPath: orgData.org_logo_path
           });
        }
      } catch (err) {
        console.error("[Auction] Notification error in createAuctionSuppRespEvents:", err);
      }

      // 🔥 8. Ranking Logic
      let suppResponseCount = 0;

      const allResponses =
        await auctionEventResponseRepo.findByAuctionId(
          Number(payload.auctionId)
        );

      if (event.allotmentType === "Lot Based") {
        suppResponseCount = await lotBasedResp(
          payload,
          event,
          saved,
          allResponses
        );
      } else if (
        ["Rank Auction", "Partial Based"].includes(
          event.allotmentType as string
        )
      ) {
        suppResponseCount = await partialBasedResp(
          payload,
          event,
          saved,
          suppResponseCount,
          allResponses
        );
      }

      // 🔥 9. Update Bid Count
      await repo.updateBidCount(
        (event.noOfBids as number || 0) + 1,
        event.id as number,
        suppResponseCount
      );

      // 🔥 10. Attachments
      if (
        files &&
        payload.suppRespDocsMapping
      ) {
        const docs = payload.suppRespDocsMapping.split("~")[1]?.split(",");

        await processAuctionSuppRespAttachments(
          Number(payload.auctionId),
          Number(payload.supplierId),
          "SUPP_PROF",
          docs,
          files,
          payload, user
        );
      }

      // 🔥 11. Auto Extension Logic
      if (
        event.ifBidInLastMinutesInMins &&
        event.acutiontTimeExtensionInMins as number > 0
      ) {
        await supplierBidInLastMins(event);
      }

      // 🔥 12. Basket History Handling
      if (event.isBasket === "Y" && basketRowId) {
        payload.templateResponseRows =
          payload.templateResponseRows?.filter(
            (r: any) => r.auRowId === basketRowId
          );
      }

      // 🔥 12b. Refresh suppProductRank from DB before writing history.
      // partialBasedResp / lotBasedResp update suppProductRank in auctionSuppResponseRow
      // but the in-memory payload rows still have null ranks from initial persist.
      if (saved?.id && Array.isArray(payload.templateResponseRows)) {
        const freshRows = await getDb()
          .select({
            auRowId: auctionSuppResponseRow.auRowId,
            suppProductRank: auctionSuppResponseRow.suppProductRank,
          })
          .from(auctionSuppResponseRow)
          .where(eq(auctionSuppResponseRow.auctionSuppRespId, Number(saved.id)));

        // Key by auRowId — rows for this supplier's response, one per template row
        const rankByAuRowId = new Map(
          freshRows.map((r) => [Number(r.auRowId), r.suppProductRank])
        );
        payload.templateResponseRows = payload.templateResponseRows.map((r: any) => {
          const auRowId = Number(r.auRowId ?? r.au_row_id);
          if (Number.isFinite(auRowId) && rankByAuRowId.has(auRowId)) {
            return { ...r, suppProductRank: rankByAuRowId.get(auRowId) };
          }
          return r;
        });
      }

      // Sync suppRank from saved (updated by ranking logic) back to payload before history write
      if (saved?.suppRank != null) {
        payload.suppRank = saved.suppRank;
      }
      await saveAuctionSuppRespHistory(payload);

      // need to work
      // 🔥 13. SSE Update
   //   sseEmitterAuctionUpdates(payload);

      return plainSuppResponseForApi(saved as Record<string, unknown>) ?? {
        auctionId: payload.auctionId,
        supplierId: payload.supplierId,
      };
    }
  } catch (e) {
    console.error(e);
  }

  return (
    plainSuppResponseForApi(null) ?? {
      auctionId: respEvent?.auctionId,
      supplierId: respEvent?.supplierId,
      error: true,
    }
  );
}

export function auctionSuppRespInfo(
  response: any,
  event: any,
  supp: any,
  dateTime: Date
) {
  // 1️⃣ Map event → response (bulk assign)
  Object.assign(response, {
    auctionName: event.name,
    templateId: event.templateId,
    acutiontTimeExtensionInMins: event.acutiontTimeExtensionInMins,
    allotmentType: event.allotmentType,
    auctionDuration: event.auctionDuration,
    auctionDurationUnits: event.auctionDurationUnits,
    auctionSavingMeasure: event.auctionSavingMeasure,
    auctionSavingReference: event.auctionSavingReference,
    auctionSavingReferenceValue: event.auctionSavingReferenceValue,
    auctionStrategy: event.auctionStrategy,
    auctionType: event.auctionType,
    currency: event.currency,
    deliveryDate: event.deliveryDate,
    deliveryDateStr: event.deliveryDateStr,
    endDateStr: event.endDateStr,
    endTime: event.endTime,
    ifBidInLastMinutesInMins: event.ifBidInLastMinutesInMins,
    isScheduledEvent: event.isScheduledEvent,
    orgId: event.orgId,
    startDateStr: event.startDateStr,
    startTime: event.startTime,
    isBasket: event.isBasket,
    basketAuctionDuration: event.basketAuctionDuration,

    // fixed fields
    status: "Submitted",
    bidTime: dateTime,
    supplierName: supp?.companyName,
  });

  // 2️⃣ Supplier Site (safe access)
  const site = supp?.suppSiteDtls?.[0];
  if (site) {
    response.siteId = site.id;
    response.supplierSite = `${site.siteName}-${site.country}-${site.city}`;
  }

  // 3️⃣ Supplier Contact (first contact only)
  const contact = supp?.suppContactDtls?.[0];
  if (contact) {
    response.supplierContact = contact.contactName;
    response.supplierContactNo = contact.mobile;
    response.supplierContactEmail = contact.email;
  }

  return response;
}

export async function processAuctionSuppRespAttachments(
  auctionId: number,
  suppId: number,
  docSource: string,
  docsList: string[],
  docs: Express.Multer.File[],
  auctionSuppResponseEvent: any, user: string
) {
  try {
    for (const doc of docs) {
      for (const docFromList of docsList) {
        if (doc.originalname === docFromList) {
          await uploadSuppRespDocument(
            auctionId,
            suppId,
            auctionSuppResponseEvent,
            docSource,
            doc, user
          );
        }
      }
    }
  } catch (error) {
    console.error("Error in processAuctionSuppRespAttachments:", error);
  }
}

export async function uploadSuppRespDocument(
  auctionId: number,
  suppId: number,
  auctionSuppResponseEvent: any,
  docSource: string,
  doc: Express.Multer.File, user: string
) {
  let uploadPath = "";

  try {
    if (!doc || !doc.buffer) return;

    // 1️⃣ ROOT PATH (like propertiesService.getDocsDir())
    const rootPath = process.env.DOCS_DIR || "uploads";

    // 2️⃣ TENANT (like SaaSAccount)
    let tenant = "development";
    // try {
    //   const sAct = await subsService.getMySaaSAccount();
    //   if (sAct?.tenantId) tenant = sAct.tenantId;
    // } catch (e) {}

    // 3️⃣ DIRECTORY PATH
    const dirPath = path.join(
      rootPath,
      tenant,
      "AUCTIONS_SUPP_RESP",
      String(auctionId),
      docSource,
      String(auctionId)
    );

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // 4️⃣ FILE NAME
    const fileName = `${Date.now()}_${doc.originalname}`;
    uploadPath = path.join(dirPath, fileName);

    // 5️⃣ WRITE FILE
    fs.writeFileSync(uploadPath, doc.buffer);

    // 6️⃣ CREATE ATTACHMENT OBJECT
    const auctionDocMapping: any = {
      attachName: doc.originalname,
      attachPath: uploadPath,
      auctionSuppResp: auctionSuppResponseEvent,
      creationTime: new Date(),
      createdBy: user,
      lastModificationTime: new Date(),
      lastModifiedBy: user,
      status: "Active",
    };

    // 7️⃣ THUMBNAIL GENERATION
    const ext = path.extname(doc.originalname).toLowerCase();

    try {
      if (ext === ".pdf") {
        try {
          const tempDir = path.join(process.cwd(), "tmp");
      
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
      
          // 1️⃣ Save temp PDF
          const tempPdfPath = path.join(tempDir, `${Date.now()}.pdf`);
          fs.writeFileSync(tempPdfPath, doc.buffer);
      
          // 2️⃣ Setup pdf2pic
          const convert = fromPath(tempPdfPath, {
            density: 100,
            saveFilename: `${Date.now()}`,
            savePath: tempDir,
            format: "png",
            width: 600,
            height: 600,
          });
      
          // 3️⃣ Convert first page
          const result = await convert(1);
      
          if (result?.path && fs.existsSync(result.path)) {
            const thumbnailBuffer = fs.readFileSync(result.path);
            auctionDocMapping.docThumbnail = thumbnailBuffer;
      
            // cleanup image
            fs.unlinkSync(result.path);
          }
      
          // cleanup PDF
          fs.unlinkSync(tempPdfPath);
      
        } catch (err) {
          console.error("PDF thumbnail generation failed:", err);
      
          // fallback
          auctionDocMapping.docThumbnail = Buffer.from("PDF");
        }
      } else {
        // IMAGE THUMBNAIL (Sharp)
        const thumbnail = await sharp(doc.buffer)
          .resize(200, 200)
          .toBuffer();

        auctionDocMapping.docThumbnail = thumbnail;
      }
    } catch (err) {
      console.error("Thumbnail generation failed:", err);
    }

    // 8️⃣ ADD TO RESPONSE EVENT
    if (!auctionSuppResponseEvent.auctionSuppRespAttachment) {
      auctionSuppResponseEvent.auctionSuppRespAttachment = [];
    }

    auctionSuppResponseEvent.auctionSuppRespAttachment.push(
      auctionDocMapping
    );
  } catch (error) {
    console.error("Error in uploadDocument:", error);
  }
}

export async function supplierBidInLastMins(event: any) {
  if (!event) return;

  const now = Date.now();
  let timeToAdd = event.endTime?.getTime?.() || now;
  let duration = event.acutiontTimeExtensionInMins || 0;
  let isBidInLastMin = false;

  // 🔥 Helper → Convert threshold into same unit
  const getThreshold = () => {
    const value = event.ifBidInLastMinutesInMins || 0;
    const unit = event.ifBidInLastMinutesInMinsUnits;

    switch (unit) {
      case "Hrs":
        return value * 60; // mins
      case "Days":
        return value * 24 * 60;
      default:
        return value;
    }
  };

  // 🔥 Helper → convert diff to unit
  const getDiff = (targetTime: number, unit: string) => {
    const diffMs = targetTime - now;

    switch (unit) {
      case "Hrs":
        return diffMs / (60 * 60 * 1000);
      case "Days":
        return diffMs / (24 * 60 * 60 * 1000);
      default:
        // Treat unknown/null units as "Mins" — consistent with getThreshold() and normalizeThreshold()
        return diffMs / (60 * 1000);
    }
  };

  // 🔥 Helper → convert threshold to same unit
  const normalizeThreshold = (threshold: number, unit: string) => {
    switch (unit) {
      case "Hrs":
        return threshold / 60;
      case "Days":
        return threshold / (60 * 24);
      default:
        return threshold;
    }
  };

  const thresholdMins = getThreshold();

  // =========================
  // 🔥 BASKET AUCTION LOGIC
  // =========================
  if (event.isBasket === "Y") {
    const templateRows =
      (await repo.getTemplateRowsWithColumnValuesForEvent(event.id)) || [];

    let timeBasketDuration = 0;

    for (const row of templateRows) {
      if (!row?.basketAuctionStatus) continue;

      const rowEnd = (row.endTime as Date).getTime() || now;

      // =========================
      // ACTIVE ROW
      // =========================
      if (row.basketAuctionStatus === "Active") {
        const diff = getDiff(rowEnd, event.acutiontTimeExtensionInMinsUnits);
        const threshold = normalizeThreshold(
          thresholdMins,
          event.acutiontTimeExtensionInMinsUnits
        );

        if (diff <= threshold) {
          const multiplier =
            event.acutiontTimeExtensionInMinsUnits === "Days"
              ? 24 * 60 * 60 * 1000
              : event.acutiontTimeExtensionInMinsUnits === "Hrs"
              ? 60 * 60 * 1000
              : 60 * 1000;

          timeToAdd += duration * multiplier;
          timeBasketDuration = rowEnd + duration * multiplier;
          isBidInLastMin = true;
        }

        await repo.updateEndTimeForRowBasketDuration(
          new Date(timeBasketDuration || row.startTime as Date),
          new Date(timeBasketDuration || rowEnd),
          Number(row.id)
        );
      }

      // =========================
      // OPEN ROW (AFTER EXTENSION)
      // =========================
      else if (isBidInLastMin && row.basketAuctionStatus === "Open") {
        const multiplier =
          event.acutiontTimeExtensionInMinsUnits === "Days"
            ? 24 * 60 * 60 * 1000
            : event.acutiontTimeExtensionInMinsUnits === "Hrs"
            ? 60 * 60 * 1000
            : 60 * 1000;

        const start = timeBasketDuration;
        const end = start + event.auctionDuration * multiplier;

        timeBasketDuration = end;

        await repo.updateEndTimeForRowBasketDuration(
          new Date(start),
          new Date(end),
          Number(row.id)
        );
      }
    }
  }

  // =========================
  // 🔥 NORMAL AUCTION
  // =========================
  else {
    const diff = getDiff(timeToAdd, event.acutiontTimeExtensionInMinsUnits);
    const threshold = normalizeThreshold(
      thresholdMins,
      event.acutiontTimeExtensionInMinsUnits
    );

    if (diff <= threshold) {
      const multiplier =
        event.acutiontTimeExtensionInMinsUnits === "Days"
          ? 24 * 60 * 60 * 1000
          : event.acutiontTimeExtensionInMinsUnits === "Hrs"
          ? 60 * 60 * 1000
          : 60 * 1000;

      timeToAdd += duration * multiplier;
      isBidInLastMin = true;
    }
  }

  // =========================
  // 🔥 FINAL UPDATE
  // =========================
  if (isBidInLastMin) {
    const endDate = new Date(timeToAdd);

    if (event.isBasket === "Y") {
      const basketAuction =
        event.auctionDuration * (event.templateRows?.length || 0) +
        event.ifBidInLastMinutesInMins;

      await repo.updateEndTimeBasketDuration(
        endDate,
        basketAuction,
        event.id
      );
    } else {
      await repo.updateEndTime(endDate, event.id);
    }

    const message = `Auction has been extended by :${event.acutiontTimeExtensionInMins} ${event.acutiontTimeExtensionInMinsUnits} : Based on Event Extension`;

    await updateAuctionOrderActivity(event.id, message, "System");

    await broadcastMessage({
      auctionId: event.id,
      broadCastMessage: `Auction time Extended for ${event.acutiontTimeExtensionInMins} ${event.acutiontTimeExtensionInMinsUnits}`,
    });

    // Trigger AUCTION_EXTENDED notification
    try {
      const user = helperUtils.getLoggedInUser(request);
      const suppMappings = await repo.getSuppMappingsForEvent(Number(event.id));
      const orgData = await adminRepo.getOrgDetails();
      for (const mapping of suppMappings) {
        if (!mapping.suppId) continue;
        try {
          const s = await vendorService.getDboSupplier(mapping.suppId);
          if (s && s.emailId) {
            eventBus.publish({
              eventType: EventTypes.AUCTION_AUTO_EXTEND,
              timestamp: new Date(),
              vendorName: s.companyName || "Vendor",
              auctionId: String(event.id),
              itemName: event.name || "Auction",
              auctionTimeExtend:event.acutiontTimeExtensionInMins,
              units: event.acutiontTimeExtensionInMinsUnits,
              newEndTime: formatIstDateTime(endDate),
              receiverEmail: s.emailId,
              orgLogoPath: orgData.org_logo_path,
              domain: (user as any)?.domain,
            });
          }
        } catch (err) {
          console.error(`[Auction] Failed to trigger extended event for supplier ${mapping.suppId}:`, err);
        }
      }
    } catch (err) {
      console.error("[Auction] Notification error in supplierBidInLastMins:", err);
    }
  }
}

const HIST_HEADER_SEQ = "au_auction_supp_event_response_history_id_seq";
const HIST_ROW_SEQ = "au_auction_supp_event_response_row_history_id_seq";
const HIST_COL_SEQ =
  "au_auction_supp_event_response_template_column_values_history_id_seq";

export async function saveAuctionSuppRespHistory(
  auctionSuppResponseEvent: any
) {
  if (!auctionSuppResponseEvent) return;

  const now = new Date();

  await getDb().transaction(async (tx) => {
    const ev = auctionSuppResponseEvent as Record<string, unknown>;
    const historyResult = await tx.execute(sql`
      INSERT INTO dbo.au_auction_supp_event_response_history (
        id,
        auction_id,
        supplier_id,
        auction_name,
        supplier_name,
        auction_total,
        supp_rank,
        status,
        bid_time,
        creation_time,
        last_modification_time
      )
      VALUES (
        ${sql.raw(`nextval('dbo.${HIST_HEADER_SEQ}'::regclass)`)},
        ${auctionSuppResponseEvent.auctionId ?? null},
        ${auctionSuppResponseEvent.supplierId ?? null},
        ${(auctionSuppResponseEvent.auctionName ?? ev.auction_name) ?? null},
        ${(auctionSuppResponseEvent.supplierName ?? ev.supplier_name) ?? null},
        ${(auctionSuppResponseEvent.auctionTotal ?? ev.auction_total) ?? null},
        ${(auctionSuppResponseEvent.suppRank ?? ev.supp_rank) ?? null},
        ${(auctionSuppResponseEvent.status ?? ev.status) ?? null},
        ${(auctionSuppResponseEvent.bidTime ?? ev.bid_time) ?? null},
        ${now},
        ${now}
      )
      RETURNING id
    `);

    const historyId = historyResult.rows[0].id;

    for (const row of auctionSuppResponseEvent.templateResponseRows || []) {
      const r = row as Record<string, unknown>;
      const rowResult = await tx.execute(sql`
        INSERT INTO dbo.au_auction_supp_event_response_row_history (
          id,
          template_id,
          au_supp_event_resp_id,
          au_row_id,
          line_item_total,
          line_item_base_price,
          supp_product_rank,
          creation_time,
          last_modification_time
        )
        VALUES (
          ${sql.raw(`nextval('dbo.${HIST_ROW_SEQ}'::regclass)`)},
          ${(row.templateId ?? r.template_id) ?? null},
          ${historyId},
          ${(row.auRowId ?? r.au_row_id) ?? null},
          ${(row.lineItemTotal ?? r.line_item_total) ?? null},
          ${(row.lineItemBasePrice ?? r.line_item_base_price) ?? null},
          ${(row.suppProductRank ?? r.supp_product_rank) ?? null},
          ${now},
          ${now}
        )
        RETURNING id
      `);

      const rowId = rowResult.rows[0].id;

      for (const column of row.columnResponseValues || []) {
        const col = column as Record<string, unknown>;
        await tx.execute(sql`
          INSERT INTO dbo.au_auction_supp_event_response_template_column_values_history (
            id,
            au_supp_event_resp_row_id,
            column_id,
            column_value,
            column_key,
            supp_rsp_column_value,
            creation_time,
            last_modification_time
          )
          VALUES (
            ${sql.raw(`nextval('dbo.${HIST_COL_SEQ}'::regclass)`)},
            ${rowId},
            ${(column.columnId ?? col.column_id) ?? null},
            ${(column.columnValue ?? col.column_value) ?? null},
            ${(column.columnKey ?? col.column_key) ?? null},
            ${(column.suppRspColumnValue ?? col.supp_rsp_column_value) ?? null},
            ${now},
            ${now}
          )
        `);
      }
    }
  });
}

export async function getSupplierResponseBySupplierId(supplierId: number) {
  // TODO
 return auctionEventResponseRepo.findBySupplierId(supplierId);
}

export async function getSupplierResponsesByAuctionId(auctionId: number) {
 const responses = await getDb()
    .select()
    .from(auctionSuppResponseEvent)
    .where(eq(auctionSuppResponseEvent.auctionId, auctionId));

  if (!responses || responses.length === 0) {
    return null;
  }
  return responses.sort(
    (a, b) => (a.suppRank ?? 0) - (b.suppRank ?? 0)
  );
}

export const updateAuctionSuppRespEvents = async (payload: any, user: string) => {
  if (!payload?.auctionId || !payload?.supplierId) {
    return payload;
  }

  try {
    const dateTime = new Date();
    const loggedInUser = user; // your util

    const event = await getAuctionEventById(payload.auctionId);
    const supp = await vendorService.getDboSupplier(
      payload.supplierId
    );

    const existing =
      await auctionEventResponseRepo.findByAuctionIdAndSupplierId(
        payload.auctionId,
        payload.supplierId
      );

    // 🔥 attribute1 increment (bid count)
    if (existing) {
      payload.attribute1 = existing.attribute1
        ? existing.attribute1 + 1
        : 1;
    }

    if (!event || !supp) return payload;

    // 🔥 populate common fields
    auctionSuppRespInfo(payload, event, supp, dateTime);

    let suppResponseCount = 0;
    let auRowIdBasket: number | null = null;
    const auRowIds: number[] = [];

    // 🔥 UPDATE FLOW — require an existing DB row; do not rely on client-sent `id`
    // (omit id → old code skipped save and returned { error: true } with HTTP 200).
    if (existing) {
      payload.id = existing.id;
      payload.lastModificationTime = new Date();
      payload.lastModifiedBy = loggedInUser;
      payload.suppRank = existing.suppRank;

      // 🔥 ROW PROCESSING
      payload.templateResponseRows =
        payload.templateResponseRows?.map((row: any) => {
          auRowIds.push(row.auRowId);

          row.lastModificationTime = new Date();
          row.lastModifiedBy = loggedInUser;
          row.createdBy = loggedInUser;

          row.auSuppEventRespId = payload;

          const rows = (event as { templateRows?: any[] }).templateRows ?? [];
          // 🔥 get mapping
          const rowMapping = rows?.find(
            (r: any) => r.id === row.auRowId
          );

          if (rowMapping) {
            row.savingsAmount = rowMapping.savingsAmount;
            row.basketAuctionStatus =
              rowMapping.basketAuctionStatus;
          }

          // 🔥 column update
          row.columnResponseValues =
            row.columnResponseValues?.map((col: any) => ({
              ...col,
              lastModificationTime: new Date(),
              lastModifiedBy: loggedInUser,
              auSuppEventRespRowId: row,
            })) || [];

          return row;
        }) || [];

      // 🔥 BASKET LOGIC
      if (event.isBasket === "Y" && existing) {
        payload.templateResponseRows.forEach((r: any) => {
          auRowIdBasket = r.auRowId;
        });

        const respRows =
          await auctionEventResponseRowRepo.findRespRowByAuRowId(
            payload.id,
            auRowIds
          );

        if (respRows?.length) {
          payload.templateResponseRows.push(...respRows);
        }
      }

      // 🔥 SAVE
      const respSaved =
        await auctionEventResponseRepo.save(payload);

      await persistAuctionSuppTemplateRows(
        Number(respSaved.id),
        payload.templateResponseRows,
        event,
        loggedInUser,
        dateTime
      );

      const saved: any = await getDb().query.auctionSuppResponseEvent.findFirst({
          where: eq(auctionSuppResponseEvent.id, respSaved.id),
          with: {
            templateResponseRows: {
              with: { columnResponseValues: true },
            },
            auctionSuppRespAttachment: true,
          },
        });
      // 🔥 ACTIVITY LOG
      if (saved.placeProxy === "Y") {
        await updateAuctionOrderActivity(
          Number(event.id),
          `Auction Response Updated through Proxy for Supplier :${saved.supplierName}`,
          loggedInUser
        );
      } else {
        await updateAuctionOrderActivity(
          Number(event.id),
          `Auction Response submitted by Supplier :${saved.supplierName}`,
          loggedInUser
        );
      }

      // 🔥 TIME EXTENSION
      if (
        event.ifBidInLastMinutesInMins &&
        Number(event.acutiontTimeExtensionInMins) > 0
      ) {
        await supplierBidInLastMins(event);
      }

      // 🔥 BID COUNT UPDATE
      await repo.updateBidCount(
        Number(event.noOfBids ?? 0) + 1,
        Number(event.id),
        Number(event.supplierRespCount)
      );

      // 🔥 RANKING
      const allResponses =
        await auctionEventResponseRepo.findByAuctionId(
          payload.auctionId
        );

      if (event.allotmentType === "Lot Based") {
        suppResponseCount = await lotBasedResp(
          payload,
          event,
          saved,
          allResponses
        );
      } else if (
        ["Rank Auction", "Partial Based"].includes(
         String(event.allotmentType)
        )
      ) {
        suppResponseCount = await partialBasedResp(
          payload,
          event,
          saved,
          suppResponseCount,
          allResponses
        );
      }

      // 🔥 FINAL BID COUNT UPDATE
      await repo.updateBidCount(
        Number(event.noOfBids ?? 0) + 1,
        Number(event.id),
        Number(suppResponseCount)
      );

      // 🔥 HISTORY
      if (saved.id) {
        // Refresh suppProductRank from DB after ranking logic has run
        // (saved was fetched before partialBasedResp updated the ranks)
        if (Array.isArray(saved.templateResponseRows)) {
          const freshRows = await getDb()
            .select({
              auRowId: auctionSuppResponseRow.auRowId,
              suppProductRank: auctionSuppResponseRow.suppProductRank,
            })
            .from(auctionSuppResponseRow)
            .where(eq(auctionSuppResponseRow.auctionSuppRespId, Number(saved.id)));

          const rankByAuRowId = new Map(
            freshRows.map((r) => [Number(r.auRowId), r.suppProductRank])
          );
          saved.templateResponseRows = saved.templateResponseRows.map((r: any) => {
            const auRowId = Number(r.auRowId ?? r.au_row_id);
            if (Number.isFinite(auRowId) && rankByAuRowId.has(auRowId)) {
              return { ...r, suppProductRank: rankByAuRowId.get(auRowId) };
            }
            return r;
          });
        }

        if (event.isBasket === "Y" && auRowIdBasket) {
          saved.templateResponseRows =
            saved.templateResponseRows.filter(
              (r: any) => r.auRowId === auRowIdBasket
            );
        }

        await saveAuctionSuppRespHistory(saved);
      }

      // need to work 
      // 🔥 SSE
      //sseEmitterAuctionUpdates(saved);

      return (
        plainSuppResponseForApi(respSaved as Record<string, unknown>) ?? {
          id: respSaved?.id,
          auctionId: payload.auctionId,
          supplierId: payload.supplierId,
        }
      );
    }
  } catch (e) {
    console.error(e);
  }

  return (
    plainSuppResponseForApi(null) ?? {
      auctionId: payload?.auctionId,
      supplierId: payload?.supplierId,
      error: true,
    }
  );
};

export async function updateSupplierAuctionSeenStatus(auctionId: number, supplierId: number, user: string) {

let userName: string = user;
let seenDateTime = new Date();
let response="";
if (null != auctionId && null != supplierId) {
auctionEventResponseRepo.updateSupplierAuctionSeenStatus(userName, seenDateTime, auctionId, supplierId, true);

response = "Updation Completed";

} else {
console.log("Update Supplier Auction updation --> Auction id and Supplier id mandatory {}");
throw new Error("Auction id and Supplier id mandatory");
}
return response;
}


export async function broadcastMessage(
  auctionBroadCastMsg: any,
  createdBy?: string
) {
  const auctionId = Number(
    auctionBroadCastMsg?.auctionId ??
      auctionBroadCastMsg?.auction_id ??
      auctionBroadCastMsg?.id
  );
  const broadCastMessage = String(
    auctionBroadCastMsg?.broadCastMessage ??
      auctionBroadCastMsg?.broad_cast_message ??
      ""
  ).trim();

  if (!Number.isFinite(auctionId) || auctionId <= 0) {
    throw new Error("auctionId is mandatory for broadcast message");
  }
  if (!broadCastMessage) {
    throw new Error("broadCastMessage is mandatory");
  }

  await getDb().execute(sql`
    CREATE TABLE IF NOT EXISTS dbo.au_auction_broadcast_message (
      id SERIAL PRIMARY KEY,
      broad_cast_message VARCHAR(1000),
      auction_id BIGINT,
      created_by VARCHAR(255),
      creation_time TIMESTAMPTZ
    )
  `);

  const loggedInUser = createdBy || helperUtils.getLoggedInUser(request);
  return await getDb().transaction(async (tx) => {
    const event = await getAuctionEventById(auctionId);
    if (!event?.id) {
      throw new Error(`Auction not found for id ${auctionId}`);
    }

    const result = await tx
      .insert(auAuctionBroadCastMessage)
      .values({
        id: sql`nextval('dbo.au_auction_broadcast_message_id_seq'::regclass)`,
        auctionId,
        broadCastMessage,
        createdBy: loggedInUser,
        creationTime: new Date(),
      })
      .returning();

    const savedMessage = result[0];

    if (!savedMessage?.broadCastMessage?.includes("Auction time Extended for")) {
      let msg = `Broad Cast Message : ${savedMessage.broadCastMessage}`;
      msg = msg.substring(0, 180);
      await updateAuctionOrderActivity(
        event.id as number,
        `${msg} : ${loggedInUser}`,
        loggedInUser
      );
    }

    return savedMessage;
  });
}


export async function updateAuctionOrderActivity(
  auctionId: number,
  activity: string,
  createdByOverride?: string
) {
  let auctionOrderActivity: any = {};
  const loggedInUser =
    createdByOverride ?? helperUtils.getLoggedInUser(request as Request);
  if (auctionId) {
    auctionOrderActivity = {
      auctionId: auctionId,
      activity: activity,
      createdBy: loggedInUser,
      creationTime: new Date()
    };

    try {
      const result = await getDb().transaction(async (tx) => {
        const saved = await tx
          .insert(auAuctionOrderActivity)
          .values({
            ...auctionOrderActivity,
            id: sql`nextval('dbo.au_auction_order_activity_id_seq'::regclass)`,
          } as typeof auAuctionOrderActivity.$inferInsert)
          .returning();

        return saved[0];
      });

      return result;
    } catch (error) {
      console.error("Auction Order Activity is not saved", error);
    }
  }

  return auctionOrderActivity;
}

export async function extendTimeRemain(payload: AuctionExtendTimeRemain) {
  const user = helperUtils.getLoggedInUser(request);
  if (!payload?.auctionId) return null;

  return await getDb().transaction(async (tx) => {
    try {
      // 1. Fetch event
      const event = await repo.getAuctionEventById(Number(payload.auctionId));

      if (!event) return null;

      let duration = Number(payload.extendTime);
      const endMs =
        event.endTime == null
          ? Date.now()
          : event.endTime instanceof Date
            ? event.endTime.getTime()
            : new Date(
                event.endTime as unknown as string | number
              ).getTime();
      let timeToAdd = endMs;

      // 2. Extend main event time
      if (duration !== 0) {
        switch (payload.extendTimeUnits) {
          case "Mins":
            timeToAdd += duration * 60 * 1000;
            break;
          case "Hrs":
            timeToAdd += duration * 60 * 60 * 1000;
            break;
          case "Days":
            timeToAdd += duration * 24 * 60 * 60 * 1000;
            break;
        }

        event.endTime = new Date(timeToAdd);

        // Trigger AUCTION_EXTENDED notification
        try {
          const suppMappings = await repo.getSuppMappingsForEvent(Number(payload.auctionId));
          const orgData = await adminRepo.getOrgDetails();
          for (const mapping of suppMappings) {
            if (!mapping.suppId) continue;
            try {
              const s = await vendorService.getDboSupplier(mapping.suppId);
              if (s && s.emailId) {
                eventBus.publish({
                    eventType: EventTypes.AUCTION_EXTENDED,
                    timestamp: new Date(),
                    vendorName: s.companyName || "Vendor",
                    auctionId: String(payload.auctionId),
                    itemName: event.name || "Auction",
                    newEndTime: formatIstDateTime(event.endTime),
                    receiverEmail: s.emailId,
                    orgLogoPath: orgData.org_logo_path,
                    domain: (user as any)?.domain
                });
              }
            } catch (err) {
              console.error(`[Auction] Failed to trigger extended event for supplier ${mapping.suppId}:`, err);
            }
          }
        } catch (err) {
          console.error("[Auction] Notification error in extendTimeRemain:", err);
        }
      }
      const rows = await repo.getTemplateRowsWithColumnValuesForEvent(Number(payload.auctionId));
      // 3. Fetch template rows
      // const rows = await tx
      //   .select()
      //   .from(auctionTemplateRows)
      //   .where(eq(auctionTemplateRows.eventId, event.id));

      let timeBasketDuration = 0;

      for (const row of rows) {
        if (
          row.basketAuctionStatus?.toLowerCase() === "active" &&
          event.isBasket === "Y"
        ) {
          if (duration !== 0) {
            let timeToAddRow =
              row.endTime?.getTime() || Date.now();

            row.startTime = timeBasketDuration
              ? new Date(timeBasketDuration)
              : row.startTime;

            let tempDuration = Number(payload.extendTime);

            switch (payload.extendTimeUnits) {
              case "Mins":
                timeToAddRow += tempDuration * 60 * 1000;
                break;
              case "Hrs":
                timeToAddRow += tempDuration * 60 * 60 * 1000;
                break;
              case "Days":
                timeToAddRow += tempDuration * 24 * 60 * 60 * 1000;
                break;
            }

            timeBasketDuration = timeToAddRow;
            row.endTime = new Date(timeBasketDuration);

            // update row
            await tx
              .update(auctionEventTemplateRowMapping)
              .set({
                startTime: row.startTime,
                endTime: row.endTime,
              })
              .where(eq(auctionEventTemplateRowMapping.id, row.id));
          }
        } else if (
          row.basketAuctionStatus?.toLowerCase() === "open" &&
          event.isBasket === "Y"
        ) {
          let tempDuration = Number(event.auctionDuration);

          if (tempDuration !== 0) {
            row.startTime = new Date(timeBasketDuration);

            switch (event.auctionDurationUnits) {
              case "Mins":
                timeBasketDuration += tempDuration * 60 * 1000;
                break;
              case "Hrs":
                timeBasketDuration += tempDuration * 60 * 60 * 1000;
                break;
              case "Days":
                timeBasketDuration += tempDuration * 24 * 60 * 60 * 1000;
                break;
            }

            row.endTime = new Date(timeBasketDuration);

            await tx
              .update(auctionEventTemplateRowMapping)
              .set({
                startTime: row.startTime,
                endTime: row.endTime,
              })
              .where(eq(auctionEventTemplateRowMapping.id, row.id));
          }
        }
      }

      // 4. Update event
      const extendedEnd: Date =
        event.endTime instanceof Date
          ? event.endTime
          : event.endTime != null
            ? new Date(event.endTime as unknown as string | number)
            : new Date();

            const unitToMs: Record<string, number> = {
        Mins: 60 * 1000,
        Hrs: 60 * 60 * 1000,
        Days: 24 * 60 * 60 * 1000,
      };

      let updatedAuctionDuration = Number(event.auctionDuration) || 0;
      if (duration !== 0 && event.isBasket !== "Y") {
        const extendMs =
          duration * (unitToMs[String(payload.extendTimeUnits)] || unitToMs.Mins);
        const durationMs =
          unitToMs[String(event.auctionDurationUnits)] || unitToMs.Mins;
        updatedAuctionDuration += extendMs / durationMs;
      }

      await tx
        .update(auctionEvent)
        .set({
          endTime: extendedEnd,
          lastModificationTime: new Date(),
          lastModifiedBy: user,
         auctionDuration: parseInt(updatedAuctionDuration.toString()),
        })
        .where(eq(auctionEvent.id, event.id as number));

      // 5. Activity log (equivalent method)
      await updateAuctionOrderActivity(
        event.id as number,
        `Auction extended by ${payload.extendTime} ${payload.extendTimeUnits}: ${user}`,
        user
      );

      // 6. Broadcast
      await broadcastMessage({
        auctionId: event.id as number,
        broadCastMessage: `Auction time extended for ${payload.extendTime} ${payload.extendTimeUnits}`,
      });

      // 7. Return updated event
      const [updatedEvent] = await tx
        .select()
        .from(auctionEvent)
        .where(eq(auctionEvent.id, event.id as number));

      return updatedEvent;
    } catch (err) {
      console.error("Error extending auction:", err);
      throw err; // rollback happens automatically
    }
  });
};


export async function updateMinBidDiff(minBid: AuctionMinBidDiff, user: string) {
  if (!minBid || minBid.auctionId == null) return null;

  try {
    const [event, templateRows] = await Promise.all([
      getAuctionEventById(minBid.auctionId),
      repo.getTemplateRowsWithColumnValuesForEvent(minBid.auctionId),
    ]);
    if (!event || event.id == null) return null;

    for (const row of templateRows) {
      for (const product of minBid.products) {
        if (Number(row.id) === Number(product.auRowId)) {
          for (const colVal of (row.columnValues as any[]) || []) {
            if (String(colVal.columnId) === String(product.columnId)) {
              await repo.updateMinBid(product.mbdvalue as string, colVal.id as number);
            }
          }
        }
      }
    }

    updateAuctionOrderActivity(event.id as number, "Updated Minimum bid Difference", user).catch(
      (e: any) => console.error("[updateMinBidDiff] activity log failed:", e?.message)
    );

    return event;
  } catch (error: any) {
    console.error("[updateMinBidDiff]", error);
    return null;
  }
}

export async function addAuctionSuppliers(auctionId: number, suppIds: number[], user: string) {
  if (!auctionId || !suppIds || suppIds.length === 0) {
    return "Error : Auction ID and SuppIds is mandatory, Please check request headers!";
  }

  try {
    // 🔹 Fetch event with suppliers
    const event = await getAuctionEventById(auctionId);

    if (!event) return null;

    const existingMappings =
      ((event as { suppIds?: unknown }).suppIds as any[]) || [];

    for (const supp of suppIds) {
      const suppObj = await vendorService.getDboSupplier(supp);

      // 🔹 Check if supplier already exists
      for (const map of existingMappings) {
        if (map.suppId === supp) {
          return `Error - Supplier '${suppObj?.companyName}' already added`;
        }
      }

      // 🔹 Insert new mapping
      await getDb().insert(auctionEventSuppMapping).values({
        id: sql`nextval('dbo.au_auction_event_supp_mapping_id_seq'::regclass)`,
        suppId: supp,
        eventId: auctionId,
        sent: true,
        createdBy: user,
        creationTime: new Date(),
      });
        const orgData = await adminRepo.getOrgDetails();
        if (suppObj && suppObj.emailId) {
            eventBus.publish({
                eventType: EventTypes.AUCTION_PUBLISHED,
                timestamp: new Date(),
                vendorName: suppObj.companyName || "Vendor",
                auctionId: String(auctionId),
                auctionType: event.auctionType || "Auction",
                auctionName: event.name || "Auction",
                startTime: formatIstDateTime(event.startTime),
                endTime: formatIstDateTime(event.endTime),
                receiverEmail: suppObj.emailId,
                ccEmail: event.createdBy || "",
                orgLogoPath: orgData.org_logo_path,
                domain: (user as any)?.domain
            });
        }

      // 🔹 Activity log
      await updateAuctionOrderActivity(
        auctionId,
        `Added Supplier '${suppObj?.companyName}' from Suppliers List`,
        user
      );
    }

    // 🔹 Return success
    return "Suppliers Added Successfully";
  } catch (e: any) {
    console.error(e);
    return null;
  }
}

async function hydrateBidSummaryItems(items: any[]): Promise<any[]> {
  return Promise.all(
    items.map(async (respHist: any) => {
      const auctionId = Number(respHist.auction_id ?? respHist.auctionId);
      const supplierId = Number(respHist.supplier_id ?? respHist.supplierId);

      // Pull current suppRank from live response table (history stores stale ranks)
      const [liveResp] = await getDb()
        .select({ id: auctionSuppResponseEvent.id, suppRank: auctionSuppResponseEvent.suppRank })
        .from(auctionSuppResponseEvent)
        .where(
          and(
            eq(auctionSuppResponseEvent.auctionId, auctionId),
            eq(auctionSuppResponseEvent.supplierId, supplierId)
          )
        );

      const rows = await getDb()
        .select()
        .from(auctionSuppResponseRowHistory)
        .where(eq(auctionSuppResponseRowHistory.auSuppEventRespId, Number(respHist.id)));

      const rowsWithCols = await Promise.all(
        rows.map(async (row) => {
          // Pull current suppProductRank from live row table
          let currentProductRank: number | null = null;
          if (liveResp?.id) {
            const [liveRow] = await getDb()
              .select({ suppProductRank: auctionSuppResponseRow.suppProductRank })
              .from(auctionSuppResponseRow)
              .where(
                and(
                  eq(auctionSuppResponseRow.auctionSuppRespId, liveResp.id),
                  eq(auctionSuppResponseRow.auRowId, Number(row.auRowId ?? (row as any).au_row_id))
                )
              );
            currentProductRank = liveRow?.suppProductRank ?? null;
          }

          const cols = await getDb()
            .select()
            .from(auctionSuppResponseColumnValuesHistory)
            .where(eq(auctionSuppResponseColumnValuesHistory.auSuppEventRespRowId, Number(row.id)));

          return {
            ...row,
            suppProductRank: currentProductRank ?? row.suppProductRank ?? (row as any).supp_product_rank,
            columnResponseValues: cols,
          };
        })
      );

      return {
        ...respHist,
        // Override stale history rank with current live rank
        supp_rank: liveResp?.suppRank ?? respHist.supp_rank,
        suppRank: liveResp?.suppRank ?? respHist.supp_rank ?? respHist.suppRank,
        bid_time: respHist.bid_time ?? respHist.creation_time,
        templateResponseRows: rowsWithCols,
      };
    })
  );
}

export async function getBidSummary(auctionId: number) {
  const flat = (await repo.getBidSummary(auctionId)) as any[];

  // Determine latestBid per supplier (mirrors getBidSummaryPartial logic)
  const latestIdBySupplierId: Record<number, number> = {};
  for (const item of flat) {
    const suppId = Number(item.supplier_id ?? item.supplierId);
    if (!Number.isFinite(suppId)) continue;
    const latestId = await auctionEventResponseHistoryRepo.findByAuctionIdSupplierId(auctionId, suppId);
    if (latestId != null) latestIdBySupplierId[suppId] = latestId;
  }

  const withLatestBid = flat.map((item: any) => {
    const suppId = Number(item.supplier_id ?? item.supplierId);
    const isDeleted = String(item.status ?? "").toLowerCase() === "deleted";
    const latestId = latestIdBySupplierId[suppId];
    return {
      ...item,
      latestBid: !isDeleted && latestId != null && Number(item.id) === latestId,
    };
  });

  return hydrateBidSummaryItems(withLatestBid);
}

// export async function awardAuction(auctionId: number, supplierId: number, awardComments: string) {
//   return repo.awardAuction(auctionId, supplierId, awardComments);
// }


export const awardAuction = async (
  auctionId: number,
  supplierId: number,
  awardComments: string,
  user: any
): Promise<string> => {
  if (!auctionId || !supplierId) {
    throw new Error("Auction ID and Supplier ID are mandatory");
  }
  const loggedInUser: any = srmUserMgmtService.getUserById(user.id);
  try {
    return await getDb().transaction(async (tx) => {
      const now = new Date();

      // 🔹 1) Check existing award (non-rejected)
      const existingAwards = await tx
        .select()
        .from(auctionSuppAwardEvent)
        .where(
          and(
            eq(auctionSuppAwardEvent.auctionId, auctionId),
            eq(auctionSuppAwardEvent.supplierId, supplierId)
          )
        );

      const alreadyExists = existingAwards.some(
        (a) => (a.status || "").toLowerCase() !== "reject"
      );

      if (alreadyExists) {
        return `Error: Auction Award already created for AuctionId=${auctionId}, SupplierId=${supplierId}`;
      }

      // 🔹 2) Fetch response (expect exactly one)
      const responses = await tx
        .select()
        .from(auctionSuppResponseEvent)
        .where(
          and(
            eq(auctionSuppResponseEvent.auctionId, auctionId),
            eq(auctionSuppResponseEvent.supplierId, supplierId)
          )
        );

      if (!responses.length) {
        return "Error: Supplier response not found for awarding";
      }

      const responseEvent = responses[0];

      // 🔹 3) Fetch parent event
      const [event] = await tx
        .select()
        .from(auctionEvent)
        .where(eq(auctionEvent.id, auctionId));

      if (!event) {
        return "Error: Auction not found";
      }

      // 🔥 4) Create Award (copy from response → manual mapping)
      const [award] = await tx
        .insert(auctionSuppAwardEvent)
        .values({
          id: sql`nextval('dbo.au_auction_supp_award_event_id_seq'::regclass)`,
          // copy relevant fields from responseEvent
          auctionId: responseEvent.auctionId,
          supplierId: responseEvent.supplierId,
          auctionName: responseEvent.auctionName,
          supplierName: responseEvent.supplierName,
          auctionTotal: responseEvent.auctionTotal,

          // overrides
          createdBy: user,
          creationTime: now,
          awardDate: now,
          status: "Draft",
          awardComments,
          auctionSuppRespNo: Number(responseEvent.id),
        })
        .returning();

       const awardId = award.id;

      // Trigger AUCTION_AWARDED and REGRET notifications
      try {
        const s = await vendorService.getDboSupplier(supplierId);
        const orgData = await adminRepo.getOrgDetails();

        // Send regret email to other participants
        const allSupps = await repo.getSuppMappingsForEvent(auctionId);
        for (const mapping of allSupps) {
          if (mapping.suppId && mapping.suppId !== supplierId) {
            const os = await vendorService.getDboSupplier(mapping.suppId);
            if (os && os.emailId) {
              eventBus.publish({
                eventType: EventTypes.AUCTION_REGRET,
                timestamp: new Date(),
                vendorName: os.companyName || "Vendor",
                receiverEmail: os.emailId,
                orgLogoPath: orgData.org_logo_path,
              });
            }
          }
        }
      } catch (err) {
        console.error("[Auction] Notification error in awardAuction:", err);
      }

      // 🔹 5) Fetch response rows
      const responseRows = await tx
        .select()
        .from(auctionSuppResponseRow)
        .where(eq(auctionSuppResponseRow.auctionSuppRespId, responseEvent.id));

      // 🔥 6) Insert Award Rows + Columns
      for (const row of responseRows) {
        const [awardRow] = await tx
          .insert(auctionSuppAwardEventRow)
          .values({
            id: sql`nextval('dbo.au_auction_supp_award_event_row_id_seq'::regclass)`,
            // copy fields
            templateId: row.templateId,
            auRowId: row.auRowId,
            lineItemTotal: row.lineItemTotal,
            lineItemBasePrice: row.lineItemBasePrice,

            // FK
            auctionSuppAwardEventId: awardId,

            // audit
            createdBy: user,
            creationTime: now,
            lastModifiedBy: user,
            lastModificationTime: now,
          })
          .returning();

        // 🔹 Fetch column values for this row
        const responseColumns = await tx.execute(/* sql */ `
          SELECT *
          FROM dbo.au_auction_supp_event_response_template_column_values
          WHERE au_supp_event_resp_row_id = ${row.id}
        `);

        if (responseColumns.rows?.length) {
          await tx.insert(auctionSuppAwardEventTemplateColumnValues).values(
            responseColumns.rows.map((col: any) => ({
              id: sql`nextval('dbo.au_auction_supp_award_event_template_column_values_id_seq'::regclass)`,
              columnId: col.column_id,
              columnValue: col.column_value,
              suppRspColumnValue: col.supp_rsp_column_value,
              auSuppEventAwardRowId: awardRow.id,
              createdBy: user,
              creationTime: now,
              lastModifiedBy: user,
              lastModificationTime: now,
            }))
          );
        }
      }

      //need to work
      // 🔹 7) Audit log (your existing util)
      // await auditService.log(
      //   String(auctionId),
      //   "Award created.",
      //   "AUCTION",
      //   "UPDATE"
      // );
  
     logAudit({
        auditKey: String(auctionId),
        auditAction: "UPDATE",
        auditMessage: "Award Created",
        fullName: loggedInUser?.name || "System",
        userId: loggedInUser?.id || "system",
        module: "AUCTIONS",
      }).catch(
        (err: any) => 
          console.error("[Audit] Failed to log:", err?.message)
      );
    
      

      // 🔹 8) Update event status
      await tx
        .update(auctionEvent)
        .set({
          status: "Award Under Process",
          lastModificationTime: now,
          lastModifiedBy: user,
        })
        .where(eq(auctionEvent.id, auctionId));

      return String(awardId);
    });
  } catch (err: any) {
    console.error("Error awarding auction:", err);
    return `Error: ${err.message}`;
  }
};

export async function getAwardDetails(auctionAwardNo: number) {
 const award: any = {};

  if (!auctionAwardNo) return award;

  try {
    let auAuctionSuppAwardEvent: any = null;
    let event: any = null;

    // 🔹 Get Award Event
    const auctionSuppAwardEvent =
      await auctionEventAwardRepo.findById(auctionAwardNo);

    if (auctionSuppAwardEvent) {
      const raw = auctionSuppAwardEvent as Record<string, unknown>;
      const normalizedAwardEvent: any = {
        ...raw,
        id: Number(raw.id),
        auctionId: Number(raw.auctionId ?? raw.auction_id),
        supplierId: Number(raw.supplierId ?? raw.supplier_id),
        auctionName: String(raw.auctionName ?? raw.auction_name ?? ""),
        supplierName: String(raw.supplierName ?? raw.supplier_name ?? ""),
        supplierContact: String(raw.supplierContact ?? raw.supplier_contact ?? ""),
        supplierContactNo: String(raw.supplierContactNo ?? raw.supplier_contact_no ?? ""),
        auctionTotal: raw.auctionTotal ?? raw.auction_total ?? null,
        awardComments: String(raw.awardComments ?? raw.award_comments ?? ""),
        attribute11: String(raw.attribute11 ?? raw.attribute_11 ?? ""),
        attribute12: String(raw.attribute12 ?? raw.attribute_12 ?? ""),
        status: String(raw.status ?? ""),
      };
      auAuctionSuppAwardEvent = normalizedAwardEvent;

      // Resolve auction + template column definitions early so column headers can be hydrated.
      event = await repo.getAuctionEventById(Number(normalizedAwardEvent.auctionId));
      award.auctionEvent = event;

      let columnDefsById = new Map<string, string>();
      try {
        const templateIdRaw = (event as any)?.templateId ?? (event as any)?.template_id;
        const templateIdNum = Number(templateIdRaw);
        if (templateIdRaw != null && templateIdRaw !== "" && Number.isFinite(templateIdNum)) {
          const templateRaw = await getEventTemplateById(templateIdNum);
          const templateNormalized = normalizeAuctionTemplateForDetails(templateRaw);
          const defs = (templateNormalized?.auAuctionEventTemplateColumnDefs ?? []) as any[];
          const defEntries: Array<[string, string]> = [];
          for (const d of defs) {
            const id = String(d?.columnId ?? d?.column_id ?? "").trim();
            const name = String(d?.columnName ?? d?.column_name ?? "").trim();
            if (id.length > 0 && name.length > 0) {
              defEntries.push([id, name]);
            }
          }
          columnDefsById = new Map<string, string>(defEntries);
        }
      } catch {
        // Non-fatal: frontend has fallbacks, continue with raw values.
      }

      // Hydrate award rows + columns for detail UI.
      const awardRows = await getDb()
        .select()
        .from(auctionSuppAwardEventRow)
        .where(eq(auctionSuppAwardEventRow.auctionSuppAwardEventId, Number(normalizedAwardEvent.id)));

      normalizedAwardEvent.templateAwardRows = await Promise.all(
        awardRows.map(async (r) => {
          const auRowId = Number((r as any).auRowId ?? (r as any).au_row_id);

          const colsRaw = await getDb()
            .select()
            .from(auctionSuppAwardEventTemplateColumnValues)
            .where(
              eq(
                auctionSuppAwardEventTemplateColumnValues.auSuppEventAwardRowId,
                Number(r.id)
              )
            );

          // Fetch buyer-defined template column values (Item Name, Quantity,
          // Delivery Location, etc.) so they aren't blank when the supplier's
          // response only contained price columns.
          const templateColsRaw = auRowId > 0
            ? await getDb()
                .select()
                .from(auctionEventTemplateColumnValues)
                .where(eq(auctionEventTemplateColumnValues.rowId, auRowId))
            : [];

          // Build columnId → templateValue map
          const templateValMap = new Map<string, string>();
          for (const tc of templateColsRaw) {
            const colId = String(tc.columnId ?? "").trim();
            if (colId && tc.columnValue != null && String(tc.columnValue).trim() !== "") {
              templateValMap.set(colId, String(tc.columnValue));
            }
          }

          // Build columnId → award column map (award values take priority)
          const awardColMap = new Map<string, any>();
          for (const c of colsRaw) {
            const colId = String((c as any).columnId ?? (c as any).column_id ?? "").trim();
            if (colId) awardColMap.set(colId, c);
          }

          // Merge: fill in template values for columns missing or blank in the award
          for (const [colId, templateValue] of templateValMap.entries()) {
            const existing = awardColMap.get(colId);
            if (!existing) {
              awardColMap.set(colId, { columnId: colId, columnValue: templateValue, suppRspColumnValue: null });
            } else {
              const hasValue =
                (existing.columnValue != null && String(existing.columnValue).trim() !== "") ||
                (existing.suppRspColumnValue != null && String(existing.suppRspColumnValue).trim() !== "");
              if (!hasValue) {
                awardColMap.set(colId, { ...existing, columnValue: templateValue });
              }
            }
          }

          // Sort columns by template definition order so every row's columns
          // are in the same order — the frontend uses index-based lookup.
          const defOrder = Array.from(columnDefsById.keys());
          const mergedCols = Array.from(awardColMap.values()).sort((a, b) => {
            const ai = defOrder.indexOf(String(a.columnId ?? "").trim());
            const bi = defOrder.indexOf(String(b.columnId ?? "").trim());
            return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
          });

          const cols = mergedCols.map((c: any) => {
            const key =
              c.columnKey ??
              c.column_key ??
              columnDefsById.get(String(c.columnId ?? c.column_id ?? "").trim()) ??
              null;
            return { ...c, columnKey: key };
          });

          return {
            ...r,
            auRowId,
            columnAwardValues: cols,
          };
        })
      );

      award.auctionSuppAwardEvent = normalizedAwardEvent;
      // Keep top-level aliases used by approval functions.
      award.id = normalizedAwardEvent.id;
      award.auctionId = normalizedAwardEvent.auctionId;
      award.auctionName = normalizedAwardEvent.auctionName;
      award.auctionTotal = normalizedAwardEvent.auctionTotal;
      award.templateAwardRows = normalizedAwardEvent.templateAwardRows;
      award.status = normalizedAwardEvent.status;
      award.approversList = String(
        normalizedAwardEvent.approversList ?? normalizedAwardEvent.approvers_list ?? ""
      );

      // 🔹 Get Supplier Responses
      if (event) {
        const auctionSuppResponseEventList =
          await auctionEventResponseRepo.findByAuctionId(event.id);

        if (auctionSuppResponseEventList?.length > 0) {
          award.auctionSuppResponseEventList =
            auctionSuppResponseEventList;
        }
      }

      // 🔥 Approver Logic
      try {
        const arList = auAuctionSuppAwardEvent.approversList;

        const finalApprs: string[] = [];
        const approvers: any[] = [];

        if (arList) {
          const apprs = arList.split(",");

          for (const uStrRaw of apprs) {
            const uStr = uStrRaw.trim();

            // 🔹 ROLE BASED
            if (
              [
                "ROLE_PROCUREMENT_OFFICER",
                "ROLE_PROCUREMENT_MANAGER",
                "ROLE_FINANCE_MANAGER",
                "ROLE_FINANCE_OFFICER",
              ].includes(uStr)
            ) {
              finalApprs.push(`Any User in ${uStr} Role`);

              const users =
                await srmUserMgmtService.getUsersInRoleByEntity(
                  uStr,
                  event.orgId
                );

              approvers.push(...users);
            } else {
              // 🔹 USER BASED
              try {
                const user =
                  await srmUserMgmtService.getLoggedInUser(uStr);

                finalApprs.push(user.name);
                approvers.push(user);
              } catch (e) {
                // ignore (same as Java)
              }
            }
          }
        }

        award.apprsList = finalApprs;
        award.approvers = approvers;
      } catch (e) {
        console.error(e);
      }

      // 🔹 Supplier Approval History
      try {
        // const regApprList =
        //   await suppRegApprRepo.findByObjectId(
        //     String(auctionAwardNo)
        //   );

        // award.suppRegstrApprDtls = regApprList;
      } catch (e) {
        console.error(e);
      }
    }

    return award;
  } catch (e: any) {
    console.error(e);
    console.error(
      "Error in getAwardDetails for Auction:",
      e.message
    );
  }

  return award;
}

export async function getAwardApprovalHistory(awardNo: number) {
  return repo.getAwardApprovalHistory(awardNo);
}

export async function submitAuctionAwardForApproval(
  auctionAwardNo: number,
  awardNotes: string,
  loggedInUser?: any
): Promise<string> {
  if (!auctionAwardNo) {
    return "Error: Auction Award No. is mandatory.";
  }
  try {
    const award = await getAwardDetails(auctionAwardNo);
    if (!award || !award.id) {
      return "Error : Event is not mapped correctly";
    }

    const event = await getAuctionEventById(Number(award.auctionId));
    if (!event || !event.id) {
      return "Error : Event is not mapped correctly";
    }

    const user =
      loggedInUser?.name || loggedInUser?.user_name || helperUtils.getLoggedInUser(request) || "SYSTEM";

    const processName = "Auction";
    const taskSubject = `Auction Award Request for - ${event.name || ""}`;
    const taskSubject1 =
      taskSubject.length > 80 ? taskSubject.substring(0, 80) : taskSubject;

    const params: any = {
      subject: taskSubject1,
      orgId: event.orgId || 0,
      srmsRefNumber: String(award.id),
      status: "Pending Approval",
      startDate: new Date().getTime(),
      createdBy: user.user_name || user.userName,
      organization: "",
      department: "",
    };

    if (event.orgId) {
      try {
        const org = await srmUserMgmtService.getOrgById(Number(event.orgId));
        params.organization = org?.organization_name || org?.organizationName || "";
      } catch (err) {
        // ignore missing org (workflow param fallback)
      }
    }

    if (award.auctionTotal != null) {
      let amount = Number(award.auctionTotal) || 0;
      try {
        const mainOrg = await adminMgmtService.getOrgDetails();
        const exRate = await repo1.getExchangeRate(event.currency as string,mainOrg.currency);

        if (exRate?.conversionRate != null) {
          amount = amount * Number(exRate.conversionRate);
        }
      } catch (err) {
        console.warn("Exchange rate lookup failed", err);
      }
      params.Amount = String(amount);
    } else {
      params.Amount = "0";
    }

    const approvers = await workflowService.getFirstStepApproversList(processName, params);
    if (!approvers || approvers.length === 0) {
      return "Error-Approver Heirarchy or Approval Flow is not defined for this request!";
    }

    const taskId = await workflowService.startProcess(
      taskSubject1,
      processName,
      String(award.id),
      params,
      user
    );

    if (!taskId) {
      return "Error: Workflow process did not return task id";
    }

    const approverNames = await workflowService.getApproversList(processName, params);

    await getDb().update(auctionSuppAwardEvent)
      .set({
        status: "Pending Approval",
        attribute12: taskId,
        approversList: Array.isArray(approverNames) ? approverNames.join(", ") : "",
        notes: awardNotes,
        lastModificationTime: new Date(),
        lastModifiedBy: user,
      })
      .where(eq(auctionSuppAwardEvent.id, Number(award.id)));
      const orgData = await adminRepo.getOrgDetails();
      const approverEmail = await getDb().execute(sql`select current_assignee from dbo.wf_step_instance where task_id=${taskId}`);
      const appUrl = await getDb().execute(sql`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
      const apiKey = await getDb().execute(sql`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);
      const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(String(apiKey.rows[0].prop_value))}&&module=${encodeURIComponent('auction')}&&taskId=${encodeURIComponent(taskId)}&&email=${encodeURIComponent(String(approverEmail.rows[0].current_assignee))}&&refnumber=${encodeURIComponent(auctionAwardNo)}`;

    //   const taskEvent: WorkflowTaskAssignedEvent = {
    //   eventType: EventTypes.TASK_ASSIGNMENT.AUCTION_AWARD_APP,
    //   timestamp: new Date(),
    //   taskId,
    //   taskName: taskSubject1,
    //   refNumber: String(award.id),
    //   refType: "AuctionAward",
    //   assigneeEmail: "",
    //   assigneeName: user,
    //   orgLogoPath: orgData.org_logo_path,
    //   emailApprovalLink: approvalLink,
    // };

    // eventBus.publish(taskEvent);

    publishTaskAssignmentEvent({
          taskId: taskId,
          templateEventId: "AUCTION_AWARD_APP",
          taskSub: `Auction award request for ${award.auctionName}`,
          submittedBy: loggedInUser?.name || user,
          department: loggedInUser?.department || "",
          entityId: event.orgId?.toString(),
          srmsRefNo: award.id?.toString(),
          domain: loggedInUser?.domain,
          variables: {
              auctionId: event.id,
              auctionName:award.auctionName,
              orgLogoPath: orgData.org_logo_path,
              domain: loggedInUser?.domain,
              emailApprovalLink: approvalLink,
          },
          emailApprovalLink:approvalLink,
      });

    return "Success";
  } catch (err: any) {
    console.error("Error in submitAuctionAwardForApproval:", err);
    return `Error: ${err.message || err}`;
  }
}

export const reRaiseAuctionAward = async (awardId: number): Promise<string> => {
  try {
    const award = await auctionEventAwardRepo.findById(awardId);
    if (!award) return "Error: Award not found";
    if ((award as any).status !== "Rejected") return "Error: Only rejected awards can be re-raised";
    await auctionEventAwardRepo.update(awardId, { status: "Draft", approversList: null } as any);
    return "Award re-raised successfully";
  } catch (err: any) {
    console.error("Error in reRaiseAuctionAward:", err);
    return `Error: ${err.message || err}`;
  }
};

export const processAwardAppr = async (
  taskId: string,
  result: string,
  comments: string,
  auctionAwardId: string,
  delegatedUser: string, 
  loggedInuser: any
): Promise<string> => {
  try {
    let wfStepInstances: any[] = [];
    const loggedInUsername =
      (loggedInuser as any)?.user_name ??
      (loggedInuser as any)?.userName ??
      (loggedInuser as any)?.email_id ??
      (loggedInuser as any)?.email ??
      (typeof loggedInuser === "string" ? loggedInuser : null);
    if (!loggedInUsername) {
      return "Error: Logged-in user is missing";
    }
    const user = await srmUserMgmtService.getLoggedInUser(loggedInUsername);
    if (!user) {
      return "Error: Logged-in user not found";
    }

    const awardIdNum = Number(auctionAwardId);
    if (!Number.isFinite(awardIdNum) || awardIdNum <= 0) {
      return "Error: Invalid auction award id";
    }
    const auctionSuppAwardEvent =
      await auctionEventAwardRepo.findById(awardIdNum);

    let event: any = {};
    let award: any = {};

    if (auctionSuppAwardEvent) {
      award = auctionSuppAwardEvent;
      const auctionIdRaw =
        (auctionSuppAwardEvent as any).auctionId ??
        (auctionSuppAwardEvent as any).auction_id;
      const auctionIdNum = Number(auctionIdRaw);
      if (!Number.isFinite(auctionIdNum) || auctionIdNum <= 0) {
        return "Error: Invalid auction id mapped to award";
      }
      event = await repo.getAuctionEventById(auctionIdNum);
      if (!event) {
        return "Error: Auction event not found for award";
      }
    } else {
      return "Error: Auction award not found";
    }

    // need to work 
   wfStepInstances = await workflowService.findByTaskId(taskId);
    const userRoles = await srmUserMgmtService.getUserRoles(user.id);
    const roleNames = userRoles.map((role: any) => role.role_name);
    const ntaskId = await workflowService.completeTask(taskId,  result as "Approve" | "Reject" | "ReSubmit" | "More", comments, user.user_name, roleNames );

    console.log("Next Task Id:", ntaskId);
     const orgData = await adminRepo.getOrgDetails();
    // 🔹 Next Task Exists
    if (ntaskId) {
      award.attribute12 = ntaskId;
      await auctionEventAwardRepo.save(award);
      const approverEmail = await getDb().execute(sql`select current_assignee from dbo.wf_step_instance where task_id=${taskId}`);
      const appUrl = await getDb().execute(sql`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
      const apiKey = await getDb().execute(sql`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);
      const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(String(apiKey.rows[0].prop_value))}&&module=${encodeURIComponent('auction')}&&taskId=${encodeURIComponent(ntaskId)}&&email=${encodeURIComponent(String(approverEmail.rows[0].current_assignee))}&&refnumber=${encodeURIComponent(auctionAwardId)}`;

      const orgIdAppr = event?.orgId ?? event?.org_id;
      publishTaskAssignmentEvent({
        taskId: ntaskId,
        templateEventId: "AUCTION_AWARD_APP",
        taskSub: `Auction award request for ${award.auctionName}`,
        submittedBy: user.name,
        department: user.departmentName || user.department_name || "",
        entityId: award.id?.toString(),
        srmsRefNo: award.id?.toString(),
        variables: {
        orgLogoPath: orgData.org_logo_path,
            domain: loggedInuser?.domain,
          emailApprovalLink:approvalLink,
      },
      emailApprovalLink:approvalLink,
      });

      // Record intermediate approval step in history
      await repo.insertAwardApprovalHistory({
        awardId: String(auctionAwardId),
        approverId: user.id,
        approverName: user.name,
        approverEmail: (user as any).email_id ?? (user as any).email ?? null,
        approverDesignation: (user as any).designation ?? null,
        status: "Approve",
        comments,
      });
    }

    // 🔹 Final Approval
    if (!ntaskId && result === "Approved") {
      award.status = "Approved";
      await auctionEventAwardRepo.save(award);

      let tAmt = event.awardAmount ?? 0;
      let aAmt = event.awardedAmount ?? 0;

      event.awardAcceptedDate = new Date();
      event.awardAccepted = user.name;
      event.approversList = user.id?.toString();

      event.awardAmount = Number(tAmt) + Number(award.auctionTotal);
      event.awardedAmount = Number(aAmt) + Number(award.auctionTotal);
      event.status = "Awarded";

      await repo.createAuctionEvent(event);
        const orgData = await adminRepo.getOrgDetails();

      try {
        const s = await vendorService.getDboSupplier(award.supplier_id);
        if (s && s.emailId) {
          //const creator = await srmUserMgmtService.getLoggedInUser(event.createdBy);
          eventBus.publish({
            eventType: EventTypes.AUCTION_AWARDED,
            timestamp: new Date(),
            vendorName: s.companyName || "Vendor",
            auctionId: String(award.auction_id),
            amount: String(award.auction_total),
            receiverEmail: s.emailId,
            ccEmail: event.createdBy || null,
            domain: loggedInuser?.domain,
            orgLogoPath: orgData.org_logo_path,
          });
        }
      } catch (err) {
        console.error("[Auction] AUCTION_AWARDED notification error:", err);
      }

      await updateAuctionOrderActivity(
        event.id,
        "Auction Award Request is Approved",
        user?.name
      );

      // need to work
      // await auditService.log(
      //   auctionAwardId,
      //   "Auction Award Request is Approved",
      //   "Auction",
      //   "APPROVED"
      // );
       logAudit({
        auditKey: String(auctionAwardId),
        auditAction: "APPROVED",
        auditMessage: "Auction Award Request is Approved",
        fullName: user?.name || "System",
        userId: user?.id || "system",
        module: "AUCTIONS",
      }).catch(
        (err: any) =>
          console.error("[Audit] Failed to log:", err?.message)
      );

      await repo.insertAwardApprovalHistory({
        awardId: String(auctionAwardId),
        approverId: user.id,
        approverName: user.name,
        approverEmail: (user as any).email_id ?? (user as any).email ?? null,
        approverDesignation: (user as any).designation ?? null,
        status: "Approve",
        comments,
      });
    }

    // 🔹 Rejected
    if (result === "Rejected") {
      award.status = "Rejected";
      award.approversList = null;

      await auctionEventAwardRepo.save(award);

      event.status = "Pending Awarded";
      await repo.createAuctionEvent(event);

      await updateAuctionOrderActivity(
        event.id,
        "Auction Award Request is Rejected",
        user?.name
      );
        const s = await vendorService.getDboSupplier(award.supplier_id);
        const creator = await srmUserMgmtService.getLoggedInUser(event.createdBy?.trim());
        eventBus.publish({
            eventType: EventTypes.AUCTION_AWARD_REJECTED,
            timestamp: new Date(),
            vendorName: s?.companyName || "Vendor",
            auctionId: String(award.auction_id),
            auctionName: event.name,
            createdBy: creator.name,
            receiverEmail: event.createdBy,
            approverName: user.name,
            domain: loggedInuser?.domain,
            orgLogoPath: orgData.org_logo_path,
        });

      // need to work 
      // await auditService.log(
      //   auctionAwardId,
      //   "Auction Award Request is Rejected",
      //   "Auction",
      //   "REJECTED"
      // );
      logAudit({
        auditKey: String(auctionAwardId),
        auditAction: "REJECTED",
        auditMessage: "Auction Award Request is Rejected",
        fullName: user?.name || "System",
        userId: user?.id || "System",
        module: "AUCTIONS",
      }).catch(
        (err: any) =>
          console.error("[Audit] Failed to log:", err?.message)
      );

      await repo.insertAwardApprovalHistory({
        awardId: String(auctionAwardId),
        approverId: user.id,
        approverName: user.name,
        approverEmail: (user as any).email_id ?? (user as any).email ?? null,
        approverDesignation: (user as any).designation ?? null,
        status: "Reject",
        comments,
      });
    }

    // 🔹 Approver List Cleanup (IMPORTANT LOGIC)
    if (result === "Approved") {
      let approverList: string = award.approversList || "";
      const assignmentType = wfStepInstances?.[0]?.assignmentType;
      const currentAssignee = wfStepInstances?.[0]?.currentAssignee;

      if (approverList && approverList.includes(",")) {
        if (assignmentType === "ROLE") {
          approverList = approverList.replace(currentAssignee + ",", "");
        } else if (assignmentType === "USER") {
          approverList = approverList.replace(currentAssignee, "");
        } else {
          approverList = approverList.replace(
            user.emailId + ",",
            ""
          );
        }
      } else {
        if (assignmentType === "ROLE" || assignmentType === "USER") {
          approverList = approverList.replace(currentAssignee, "");
        } else {
          approverList = approverList.replace(user.emailId, "");
        }
      }

      award.approversList = approverList;
      await auctionEventAwardRepo.save(award);
    }

    // 🔹 Save Event Again (same as Java)
    await repo.createAuctionEvent(event);

    // need to work 
    // 🔹 Approver History
    await helperUtils.logApproversHistory(
      wfStepInstances,
      "AWARD",
      auctionAwardId,
      "0",
      user,
      comments,
      new Date(),
      result,
      delegatedUser,
      user
    );

    return "Successfully processed your request.";
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Error in processAwardAppr:", msg);
    return `Error: ${msg}`;
  }
};

export async function cancelAward(awardId: number) {
  return repo.cancelAward(awardId);
}

export async function sseEmitters(auctionId: string) {
  return repo.sseEmitters(auctionId);
}

export async function auctionLineGraph(auctionId: number) {
  const lineGraph: any = {
    auctionId,
    auctionDetails: [],
  };

  try {
    const auctionResponse = await auctionEventResponseHistoryRepo.findByAuctionId(auctionId);

    if (auctionResponse && auctionResponse.length > 0) {
      // 🔥 group by supplierName (equivalent to Java groupingBy)
      const auctionSupp = auctionResponse.reduce((acc: any, curr: any) => {
        const key = curr.supplierName;

        if (!acc[key]) acc[key] = [];
        acc[key].push(curr);

        return acc;
      }, {});

      const lineGraphDetails = (Object.entries(auctionSupp) as [string, any[]][]).map(
        ([supplierName, records]: [string, any[]]) => {
          const lineGraphDetail: any = {
            supplierName,
            supplierId: records[0]?.supplierId,
            bidDetails: [],
          };

          const bidDetails = records.map((en: any) => ({
            bidAmount: en.auctionTotal,
            bidDateTime: en.bidTime,
          }));

          lineGraphDetail.bidDetails = bidDetails;

          return lineGraphDetail;
        }
      );

      lineGraph.auctionDetails = lineGraphDetails;
    }

    return lineGraph;
  } catch (error) {
    console.error("Error in auctionLineGraph:", error);
    return lineGraph;
  }
};

export async function getDraftAuctions() {
  const rows = await repo.getDraftAuctions();
  return attachSupplierNamesToBuyerListRows(rows);
}

export async function getDraftAuctionById(auctionId: number) {
  return repo.getDraftAuctionById(auctionId);
}

// export async function deleteResponse(auctionId: number, supplierId: number, id: number) {
//   return repo.deleteResponse(auctionId, supplierId, id);
// }

export async function locationsOfAuctions(events: any[]) {
  // Convert the Java-based location/award aggregation logic into a TS version.
  // NOTE: This implementation uses helper repo functions which are currently stubs.
  const locations = await repo.getAllLocations();
  const awards: any[] = await repo.getAllAuctionAwards();

  for (const auRaw of events) {
    const au: any = auRaw;
    const locationList: string[] = [];

    if (Array.isArray(au.auctionLocations)) {
      locationList.push(...au.auctionLocations);
    }

    const draftCount = await repo.getAuctionAwardCount(au.id, "Draft");
    au.draftBidCount = draftCount;

    const rejectCount = await repo.getAuctionAwardCount(au.id, "Rejected");
    au.rejBidCount = rejectCount;

    if (typeof au.status === "string" && au.status.toLowerCase() === "award under process") {
      const auctionAwards = awards.filter(
        (aw: any) => au.id === (aw.auctionId ?? aw.auction_id)
      );
      let count = 0;
      for (const award of auctionAwards) {
        if (award.status !== "cancelled") {
          count += ((award.templateAwardRows as any[])?.length || 0);
        }
      }

      if (count !== 0) {
        au.auAwardStatus = count !== ((au.templateRows as any[])?.length ?? 0) ? "Partially" : "Completely";
      }
    }

    const templateIdRaw = au.templateId ?? au.template_id;
    const templateIdNum = Number(templateIdRaw);
    const template: any =
      templateIdRaw != null && templateIdRaw !== "" && Number.isFinite(templateIdNum)
        ? await getEventTemplateById(templateIdNum)
        : null;
    const columnDefs: any[] = (template?.auAuctionEventTemplateColumnDefs ?? []) as any[];

    const templateRows = (au.templateRows ?? au.template_rows) as any[] | undefined;
    for (const row of templateRows ?? []) {
      for (const columnDef of columnDefs) {
        if (String(columnDef?.columnName).toLowerCase() === "delivery location") {
          const key = getValueForKey(row?.columnValues, columnDef?.columnId);
          const locationName = getValueForKeyLocation(locations, key);
          if (locationName) locationList.push(locationName);
        }
      }
    }

    au.auctionLocations = locationList;
  }

  return events;
}

/** Raw template rows often store column defs only in `attribute1` JSON. */
function normalizeAuctionTemplateForDetails(template: any): any {
  if (!template) return template;
  let defs = template.auAuctionEventTemplateColumnDefs;
  if ((!defs || !Array.isArray(defs) || defs.length === 0) && template.attribute1) {
    try {
      const raw =
        typeof template.attribute1 === "string"
          ? JSON.parse(template.attribute1)
          : template.attribute1;
      if (Array.isArray(raw)) defs = raw;
      else if (raw && Array.isArray(raw.auAuctionEventTemplateColumnDefs)) {
        defs = raw.auAuctionEventTemplateColumnDefs;
      }
    } catch {
      /* ignore */
    }
  }
  return { ...template, auAuctionEventTemplateColumnDefs: defs ?? [] };
}

function orgPick(row: Record<string, unknown>, camel: string, snake: string) {
  const a = row[camel];
  if (a != null) return a;
  return row[snake];
}

function mapOrgDetailsForApi(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return null;
  return {
    id: row.id ?? null,
    attribute1: orgPick(row, "attribute1", "attribute_1") ?? null,
    attribute2: orgPick(row, "attribute2", "attribute_2") ?? null,
    attribute3: orgPick(row, "attribute3", "attribute_3") ?? null,
    attribute4: orgPick(row, "attribute4", "attribute_4") ?? null,
    attribute5: orgPick(row, "attribute5", "attribute_5") ?? null,
    attribute6: orgPick(row, "attribute6", "attribute_6") ?? null,
    attribute7: orgPick(row, "attribute7", "attribute_7") ?? null,
    attribute8: orgPick(row, "attribute8", "attribute_8") ?? null,
    attribute9: orgPick(row, "attribute9", "attribute_9") ?? null,
    attribute10: orgPick(row, "attribute10", "attribute_10") ?? null,
    attribute11: orgPick(row, "attribute11", "attribute_11") ?? null,
    attribute12: orgPick(row, "attribute12", "attribute_12") ?? null,
    attribute13: orgPick(row, "attribute13", "attribute_13") ?? null,
    attribute14: orgPick(row, "attribute14", "attribute_14") ?? null,
    attribute15: orgPick(row, "attribute15", "attribute_15") ?? null,
    createdBy: orgPick(row, "createdBy", "created_by") ?? null,
    creationDate: orgPick(row, "creationDate", "creation_date") ?? null,
    ipAddress: orgPick(row, "ipAddress", "ip_address") ?? null,
    lastModifiedBy: orgPick(row, "lastModifiedBy", "last_modified_by") ?? null,
    lastModifiedDate: orgPick(row, "lastModifiedDate", "last_modified_date") ?? null,
    organizationName: orgPick(row, "organizationName", "organization_name") ?? null,
    orgLegalName: orgPick(row, "orgLegalName", "org_legal_name") ?? null,
    orgLegalAddr: orgPick(row, "orgLegalAddr", "org_legal_addr") ?? orgPick(row, "orgLegalAddress", "org_legal_address") ?? null,
    orgCity: orgPick(row, "orgCity", "org_city") ?? null,
    orgState: orgPick(row, "orgState", "org_state") ?? null,
    orgCountry: orgPick(row, "orgCountry", "org_country") ?? null,
    orgPostalCode: orgPick(row, "orgPostalCode", "org_postalcode") ?? orgPick(row, "orgPostalCode", "org_postal_code") ?? null,
    orgRegisterNo: orgPick(row, "orgRegisterNo", "org_registration_no") ?? orgPick(row, "orgRegisterNo", "org_register_no") ?? null,
    orgPhoneNo: orgPick(row, "orgPhoneNo", "org_phone_no") ?? null,
    orgEmail: orgPick(row, "orgEmail", "org_email") ?? null,
    orgLogoPath: orgPick(row, "orgLogoPath", "org_logo_path") ?? null,
    orgType: orgPick(row, "orgType", "org_type") ?? null,
    entityType: orgPick(row, "entityType", "entity_type") ?? null,
    dateFormat: orgPick(row, "dateFormat", "date_format") ?? null,
    numberFormat: orgPick(row, "numberFormat", "number_format") ?? null,
    roundingPrecision: orgPick(row, "roundingPrecision", "rounding_precision") ?? null,
    defaultTax: orgPick(row, "defaultTax", "default_tax") ?? null,
    defaultPaymentTerms: orgPick(row, "defaultPaymentTerms", "default_paymentterms") ?? orgPick(row, "defaultPaymentTerms", "default_payment_terms") ?? null,
    currency: row.currency ?? null,
    subsidaryId: orgPick(row, "subsidaryId", "subsidary_id") ?? orgPick(row, "subsidiaryId", "subsidiary_id") ?? null,
  };
}

async function resolveAuctionOrgDetails(orgIdRaw: unknown): Promise<Record<string, unknown> | null> {
  const orgId = Number(orgIdRaw);
  if (Number.isFinite(orgId) && orgId > 0) {
    const byId = await getDb().execute(sql`
      SELECT *
      FROM dbo.um_org_dtls
      WHERE id = ${orgId}
      LIMIT 1
    `);
    const row = (byId.rows?.[0] as Record<string, unknown> | undefined) ?? null;
    if (row) return mapOrgDetailsForApi(row);
  }

  // Fallback for older/migrated events with null orgId.
  const mainOrg = await getDb().execute(sql`
    SELECT *
    FROM dbo.um_org_dtls
    WHERE org_type = 'INTERNAL' AND entity_type = 'MAIN'
    ORDER BY id
    LIMIT 1
  `);
  const row = (mainOrg.rows?.[0] as Record<string, unknown> | undefined) ?? null;
  return mapOrgDetailsForApi(row);
}

async function tryReadLegacyTncIdsForAuction(auctionId: number): Promise<number[]> {
  if (!Number.isFinite(auctionId) || auctionId <= 0) return [];

  type ColRow = { column_name?: string };
  type TblRow = { table_name?: string };

  const candidates = await getDb().execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'dbo'
      AND table_type = 'BASE TABLE'
      AND (
        table_name ILIKE '%tnc%' OR
        table_name ILIKE '%term%'
      )
  `);

  const tables = (candidates.rows as TblRow[])
    .map((r) => String(r.table_name ?? "").trim())
    .filter((t) => t.length > 0);

  for (const tableName of tables) {
    const safeTable = /^[a-zA-Z0-9_]+$/.test(tableName) ? tableName : "";
    if (!safeTable) continue;

    const colsRes = await getDb().execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'dbo'
        AND table_name = ${safeTable}
    `);
    const cols = (colsRes.rows as ColRow[])
      .map((r) => String(r.column_name ?? "").trim().toLowerCase())
      .filter(Boolean);

    const eventCol = cols.find((c) =>
      ["eventid", "event_id", "auctionid", "auction_id"].includes(c)
    );
    const tncCol = cols.find((c) =>
      ["tncid", "tnc_id", "tncid_fk", "terms_id", "term_id"].includes(c)
    );
    if (!eventCol || !tncCol) continue;

    const query = sql.raw(`
      SELECT DISTINCT ${tncCol} AS tnc_id
      FROM dbo.${safeTable}
      WHERE ${eventCol} = ${Number(auctionId)}
    `);
    try {
      const rows = await getDb().execute(query);
      const ids = (rows.rows as Array<{ tnc_id?: unknown }>)
        .map((r) => Number(r.tnc_id))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (ids.length) return Array.from(new Set(ids));
    } catch {
      // continue trying other candidate tables
    }
  }
  return [];
}

async function extractTncIds(event: any, auctionId?: number): Promise<number[]> {
  const relationIds = ((event as { tncIds?: unknown }).tncIds as any[] | undefined) ?? [];
  const fromRelation = relationIds
    .map((t: any) => Number(t?.tncId ?? t?.id ?? t))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (fromRelation.length) return fromRelation;

  const raw = (event as { attribute15?: unknown }).attribute15;
  if (raw == null || raw === "") return [];
  const text = String(raw).trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const ids = parsed
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (ids.length) return ids;
    }
  } catch {
    // fallback to comma-separated format
  }

  const csvIds = text
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (csvIds.length) return csvIds;

  // Legacy fallback for already-created auctions: detect mapping table rows and persist.
  if (Number.isFinite(auctionId) && Number(auctionId) > 0) {
    const legacyIds = await tryReadLegacyTncIdsForAuction(Number(auctionId));
    if (legacyIds.length) {
      try {
        await getDb()
          .update(auctionEvent)
          .set({
            attribute15: JSON.stringify(legacyIds),
            lastModificationTime: new Date(),
          })
          .where(eq(auctionEvent.id, Number(auctionId)));
      } catch {
        // non-blocking; still return resolved ids
      }
      return legacyIds;
    }
  }
  return [];
}

function getValueForKey(values: any[], key: any) {
  if (!Array.isArray(values)) return undefined;
  const match = values.find((v: any) => String(v?.columnId) === String(key));
  return match?.columnValue ?? match?.value;
}

function getValueForKeyLocation(locations: any[], key: any) {
  if (!Array.isArray(locations)) return undefined;
  const match = locations.find((loc: any) => String(loc?.id) === String(key) || String(loc?.locationCode) === String(key));
  return match?.name || match?.locationName || key;
}
export function getAllAuctionEventsBySupplier(supplierId: number) {
    repo.updateStatus();
return repo.getAuctionsBySupplierId(supplierId);
}

export async function getActiveAuctionsBySupplierId(
  supplierId: number,
  pageNo?: number,
  pageSize?: number
) {
  return await repo.getActiveAuctionsBySupplierId(supplierId, pageNo, pageSize);
}


export async function getCompletedAuctionsBySupplierId(supplierId: number, pageNo: number, pageSize: number) {
   return await repo.getCompletedAuctionsBySupplierId(supplierId, pageNo, pageSize);
}

export async function getUpcomingAuctionsBySupplierId(supplierId: number, pageNo: number, pageSize: number) {
    return await repo.getUpcomingAuctionsBySupplierId(supplierId, pageNo, pageSize);    
}

export async function getAuctionorderActivity(auctionId: number) {
  const orderActivity: any[] = [];
  if (!Number.isFinite(auctionId)) {
    return orderActivity;
  }
  try {
    const auctionEvent = await repo.getAuctionEventById(auctionId);
    const rows = await auctionOrderActivityrepo.getOrderActivityByAuctionId(auctionId);
    orderActivity.push(...rows);
    if (
      !auctionEvent ||
      orderActivity.length === 0 ||
      auctionEvent.status === "Active" ||
      auctionEvent.status === "Scheduled" ||
      auctionEvent.status === "Draft"
    ) {
      /* skip synthetic "Auction Closed" row */
    } else {
      const order: AuAuctionOrderActivity = {} as any;
      order.auctionId = auctionId;
      order.createdBy = null;
      order.creationTime = auctionEvent.endTime ?? null;
      order.activity =
        "Auction Closed at " +
        dayjs(auctionEvent.endTime ?? undefined).format("YYYY-MM-DD HH.mm ");
      orderActivity.push(order);
    }
  } catch (error) {
    console.error(error);
  }
  return orderActivity;
}

export function getBroadCastMessage(auctionId: number) {
  if (Number.isFinite(auctionId) && auctionId > 0) {
return auctionBroadCastMessageRepo.getByAuctionId(auctionId);
} else {
console.error("Please provide the Auction ID {}" + auctionId);
return [];
}
}

export const withdrawAuction = async (
  payload: any,
  user: string
) => {
  if (!payload?.auctionId) {
    throw new Error("Auction ID is mandatory");
  }

  return await getDb().transaction(async (tx) => {
    try {
      // 🔹 Fetch event
      const [event] = await tx
        .select()
        .from(auctionEvent)
        .where(eq(auctionEvent.id, payload.auctionId));

      if (!event) {
        throw new Error("Auction not found");
      }

      const now = new Date();

      // 🔹 Update event
      await tx
        .update(auctionEvent)
        .set({
          auctionWithdrawReason: payload.withdrawReason,
          isAuctionWithdraw: true,
          lastModificationTime: now,
          lastModifiedBy: user,
          status: "Withdraw",
          endTime: now,
        })
        .where(eq(auctionEvent.id, event.id));

      // 🔥 Basket logic (update rows)
      if (event.isBasket?.toLowerCase() === "y") {
        await tx
          .update(auctionEventTemplateRowMapping)
          .set({
            basketAuctionStatus: "Withdraw",
            endTime: now,
          })
          .where(eq(auctionEventTemplateRowMapping.eventId, event.id));
      }

      // 🔹 Activity log
      await updateAuctionOrderActivity(
        event.id,
        "Auction Withdrawn",
        user
      );


      // need to work
      // 🔹 Notification
      // await pushNotificationService.sendNotifications(
      //   "Auction Withdrawn",
      //   event,
      //   "Auction Withdrawn"
      // );

      // 🔹 Return updated event
      const [updatedEvent] = await tx
        .select()
        .from(auctionEvent)
        .where(eq(auctionEvent.id, event.id));

      return updatedEvent;
    } catch (err) {
      console.error("Error withdrawing auction:", err);
      throw err; // rollback
    }
  });
};

export const copyAuction = async (
  auctionId: number,
  user: string
): Promise<string> => {
  if (!auctionId) {
    return "Error: Auction Id not found.";
  }

  try {
    return await getDb().transaction(async (tx) => {
      // 🔹 1. Fetch full event with relations
      const event = await tx.query.auctionEvent.findFirst({
        where: eq(auctionEvent.id, auctionId),
        with: {
          templateRows: {
            with: {
              columnValues: true,
              suppWiseCap: true, // if defined
            },
          },
          suppIds: true,
        },
      });

      if (!event) {
        return "Error: Auction not found.";
      }

      const now = new Date();

      // 🔹 2. Create new event (copy fields)
      const [newEvent] = await tx
        .insert(auctionEvent)
        .values({
          id: sql`nextval('dbo.au_auction_event_id_seq'::regclass)`,
          name: event.name,
          createdBy: user,
          lastModifiedBy: user,
          creationTime: now,
          lastModificationTime: now,

          templateId: event.templateId,
          auctionType: event.auctionType,
          auctionStrategy: event.auctionStrategy,
          allotmentType: event.allotmentType,
          auctionDurationUnits: event.auctionDurationUnits,

          auctionSavingMeasure: event.auctionSavingMeasure,
          auctionSavingReference: event.auctionSavingReference,
          auctionSavingReferenceValue: event.auctionSavingReferenceValue,

          auctionWithdrawReason: event.auctionWithdrawReason,
          isBasket: event.isBasket,
          basketAuctionDuration: event.basketAuctionDuration,
          currency: event.currency,

          isAuctionWithdraw: event.isAuctionWithdraw,
          status: "Draft",
          auctionDuration: event.auctionDuration,
          noOfBids: 0,
          orgId: event.orgId,
        })
        .returning();

      const newEventId = newEvent.id;
      const templateRows: any[] = event.templateRows || [];
      // 🔥 3. Copy rows + columns + caps
      for (const row of templateRows) {
        const [newRow] = await tx
          .insert(auctionEventTemplateRowMapping)
          .values({
            id: sql`nextval('dbo.au_auction_event_template_row_mapping_id_seq'::regclass)`,
            templateId: row.templateId,
            eventId: newEventId,
            createdBy: user,
            lastModifiedBy: user,
            creationTime: now,
            lastModificationTime: now,
          })
          .returning();

        const newRowId = newRow.id;

        // 🔹 Copy column values
        if (row.columnValues?.length) {
          await tx.insert(auctionEventTemplateColumnValues).values(
            row.columnValues.map((col: InsertAuctionEventTemplateColumnValues) => ({
              id: sql`nextval('dbo.au_auction_event_template_column_values_id_seq'::regclass)`,
              rowId: newRowId,
              columnId: col.columnId,
              columnValue: col.columnValue,
              createdBy: user,
              lastModifiedBy: user,
              creationTime: now,
              lastModificationTime: now,
            }))
          );
        }

        // 🔹 Copy supplier-wise caps (if exists)
        if (row.suppWiseCap?.length) {
          await tx.insert(auctionEventSuppWiseCap).values(
            row.suppWiseCap.map((cap: InsertAuctionEventSuppWiseCap
            ) => ({
              id: sql`nextval('dbo.au_auction_event_supp_wise_cap_id_seq'::regclass)`,
              rowId: newRowId,
              suppId: cap.suppId,
              supplierName: cap.supplierName,
              price: cap.price,
              createdBy: user,
              lastModifiedBy: user,
              creationTime: now,
              lastModificationTime: now,
            }))
          );
        }
      }

      // 🔹 4. Copy suppliers
      if ((event.suppIds as any[])?.length) {
        await tx.insert(auctionEventSuppMapping).values(
          (event.suppIds as InsertAuctionEventSuppMapping[]).map((s) => ({
            id: sql`nextval('dbo.au_auction_event_supp_mapping_id_seq'::regclass)`,
            eventId: newEventId,
            suppId: s.suppId,
            sent: true,
            createdBy: user,
            creationTime: now,
          }))
        );
      }

      return "Success";
    });
  } catch (err) {
    console.error("Error copying auction:", err);
    return "Error: Unable to Copy Auction.";
  }
};

export const awardAuctionPartial = async (
  auctionId: number,
  partialAward: any[],
  awardComments: string,
  user: any
): Promise<string | null> => {
  console.log("Entered into Auction Service - Award Auction Partial");

  if (!auctionId) {
    throw new Error("Auction ID is mandatory");
  }

  if (!partialAward?.length) {
    throw new Error("At least one product and supplier is required");
  }

  // 🔹 1. Extract supplierIds & rowIds
  const supplierIds: number[] = [];
  const rowIds: number[] = [];

  for (const pAward of partialAward) {
    if (!pAward?.supplierId || !pAward?.rowId?.length) {
      throw new Error(
        `Supplier id or Row id is missing for supplierId=${pAward?.supplierId}`
      );
    }

    supplierIds.push(pAward.supplierId);
    rowIds.push(...pAward.rowId);
  }

  try {
    // 🔹 2. Fetch existing awards
    const existingAwards = await getDb()
      .select()
      .from(auctionSuppAwardEvent)
      .where(eq(auctionSuppAwardEvent.auctionId, auctionId));

    // 🔹 3. Fetch rows already awarded
    if (existingAwards.length) {
      const awardedRows = await getDb()
        .select({
          auRowId: auctionSuppAwardEventRow.auRowId,
          status: auctionSuppAwardEvent.status,
        })
        .from(auctionSuppAwardEventRow)
        .innerJoin(
          auctionSuppAwardEvent,
          eq(
            auctionSuppAwardEventRow.auctionSuppAwardEventId,
            auctionSuppAwardEvent.id
          )
        );

      const conflicting = awardedRows.some(
        (row: any) =>
          rowIds.includes(Number(row.auRowId)) &&
          !["Cancelled", "Rejected"].includes(row.status || "")
      );

      if (conflicting) {
        // Same behavior as Java (return null)
        return null;
      }
    }

    // 🔹 4. Fetch auction event
    const [event] = await getDb()
      .select()
      .from(auctionEvent)
      .where(eq(auctionEvent.id, auctionId));

    if (!event) {
      throw new Error("Auction not found");
    }

    // 🔥 5. Call partial awarding flow
    return await awadingPartialFlow(
      auctionId,
      partialAward,
      awardComments,
      rowIds,
      event,
      user
    );
  } catch (err: any) {
    console.error(
      "Error while executing Award Auction Partial:",
      err.message
    );
    return null;
  }
};

export const awadingPartialFlow = async (
  auctionId: number,
  partialAward: any[],
  awardComments: string,
  rowIds: number[],
  event: any,
  user: any
): Promise<string> => {
  let awardIds = "";

  return await getDb().transaction(async (tx:any) => {
    const now = new Date();

    for (const pAward of partialAward) {
      // 🔹 1. Fetch response event
      const responses = await tx
        .select()
        .from(auctionSuppResponseEvent)
        .where(
          and(
            eq(auctionSuppResponseEvent.auctionId, auctionId),
            eq(auctionSuppResponseEvent.supplierId, pAward.supplierId)
          )
        );

      if (!responses.length) continue;

      const responseEvent = responses[0];

      // 🔹 2. Create Award (copy basic fields)
      const [award] = await tx
        .insert(auctionSuppAwardEvent)
        .values({
          id: sql`nextval('dbo.au_auction_supp_award_event_id_seq'::regclass)`,
          auctionId: responseEvent.auctionId,
          supplierId: responseEvent.supplierId,
          auctionName: responseEvent.auctionName,
          supplierName: responseEvent.supplierName,
          auctionTotal: null, // will update later

          createdBy: user.name,
          creationTime: now,
          awardDate: now,
          status: "Draft",
          awardComments,
          auctionSuppRespNo: Number(responseEvent.id),
        })
        .returning();

      let rowTotal = 0;

      // 🔹 3. Fetch only required rows
      const responseRows = await tx
        .select()
        .from(auctionSuppResponseRow)
        .where(
          and(
            eq(auctionSuppResponseRow.auctionSuppRespId, responseEvent.id),
            inArray(auctionSuppResponseRow.auRowId, pAward.rowId)
          )
        );

      for (const row of responseRows) {
        // 🔥 accumulate total
        rowTotal += Number(row.lineItemTotal || 0);

        // 🔹 Insert award row
        const [awardRow] = await tx
          .insert(auctionSuppAwardEventRow)
          .values({
            id: sql`nextval('dbo.au_auction_supp_award_event_row_id_seq'::regclass)`,
            templateId: row.templateId,
            auRowId: row.auRowId,
            lineItemTotal: row.lineItemTotal,
            lineItemBasePrice: row.lineItemBasePrice,

            auctionSuppAwardEventId: award.id,

            createdBy: user.name,
            creationTime: now,
            lastModifiedBy: user.name,
            lastModificationTime: now,
          })
          .returning();

        // 🔹 Fetch column values
        const columns = await tx
          .select()
          .from(auctionSuppEventResponseTemplateColumnValues)
          .where(
            eq(
              auctionSuppEventResponseTemplateColumnValues.auctionSuppRespRowId,
              row.id
            )
          );

        // 🔹 Insert award columns
        if (columns.length) {
          await tx
            .insert(auctionSuppAwardEventTemplateColumnValues)
            .values(
              columns.map((col:any) => ({
                id: sql`nextval('dbo.au_auction_supp_award_event_template_column_values_id_seq'::regclass)`,
                columnId: col.columnId,
                columnValue: col.columnValue,
                suppRspColumnValue: col.suppRspColumnValue,
                auSuppEventAwardRowId: awardRow.id,

                createdBy: user.name,
                creationTime: now,
                lastModifiedBy: user.name,
                lastModificationTime: now,
              }))
            );
        }
      }

      // 🔥 4. Update total
      await tx
        .update(auctionSuppAwardEvent)
        .set({
          auctionTotal: String(rowTotal),
        })
        .where(eq(auctionSuppAwardEvent.id, award.id));

      // 🔹 5. Audit log
      // await auditService.log(
      //   String(auctionId),
      //   "Award created.",
      //   "AUCTION",
      //   "UPDATE"
      // );

      logAudit({
        auditKey: String(auctionId),
        auditAction: "UPDATE",
        auditMessage: "Auction Award Created",
        fullName: user?.name || "System",
        userId: user?.id || "system",
        module: "AUCTIONS",
      }).catch(
        (err: any) => 
          console.error("[Audit] Failed to log:", err?.message)
      );

      // 🔹 6. Update event status
      await tx
        .update(auctionEvent)
        .set({
          status: "Award Under Process",
          lastModifiedBy: user.name,
          lastModificationTime: now,
        })
        .where(eq(auctionEvent.id, auctionId));

      awardIds += `${award.id}, `;
    }

    return awardIds;
  });
};

export const deleteTemplateRows = async (
  auctionId: number,
  rowId: number
): Promise<string> => {
  try {
    if (!auctionId || !rowId) {
      return "Please provide the Auction Id and Row Id";
    }

    return await getDb().transaction(async (tx:any) => {
      // 🔹 1. Check if auction exists
      const [event] = await tx
        .select()
        .from(auctionEvent)
        .where(eq(auctionEvent.id, auctionId));

      if (!event) {
        return "Provided Auction Id not found";
      }

      // 🔹 2. Check if row exists
      const [row] = await tx
        .select()
        .from(auctionEventTemplateRowMapping)
        .where(eq(auctionEventTemplateRowMapping.id, rowId));

      if (!row) {
        return "RowId not found";
      }

      // 🔥 3. Delete column values (child)
      await tx
        .delete(auctionEventTemplateColumnValues)
        .where(eq(auctionEventTemplateColumnValues.rowId, rowId));

      // 🔥 4. Delete supplier-wise cap (if exists)
      await tx
        .delete(auctionEventSuppWiseCap)
        .where(eq(auctionEventSuppWiseCap.rowId, rowId));

      // 🔥 5. Delete row itself
      await tx
        .delete(auctionEventTemplateRowMapping)
        .where(eq(auctionEventTemplateRowMapping.id, rowId));

      return "Success";
    });
  } catch (err) {
    console.error("Error deleting template row:", err);
    return "Error";
  }
};

export const deleteResponse = async (
  auctionId: number,
  supplierId: number,
  id: number,
  user: string
): Promise<string> => {
  let supplierName = "";
  let pendingNotificationAmount: string | null = null;
  let pendingRecalc: {
    allotmentType: string;
    response: any;
    event: any;
  } | null = null;

  try {
    const txResult = await getDb().transaction(async (tx:any) => {
      // 🔹 1. Validate auction
      const [event] = await tx
        .select()
        .from(auctionEvent)
        .where(eq(auctionEvent.id, auctionId));

      if (!event) {
        return "Auction not found";
      }

      // 🔹 2. Get response (may already be deleted — treat as optional)
      const [response] = await tx
        .select()
        .from(auctionSuppResponseEvent)
        .where(
          and(
            eq(auctionSuppResponseEvent.auctionId, auctionId),
            eq(auctionSuppResponseEvent.supplierId, supplierId)
          )
        );

      // 🔹 3. Check history record — this is the source of truth for the delete
      const [targetHistory] = await tx
        .select()
        .from(auctionSuppResponseEventHistory)
        .where(eq(auctionSuppResponseEventHistory.id, id));

      if (!targetHistory) {
        return "Provided Response Id not found";
      }

      // 🔥 4. Soft delete history record (always, even if response event is already gone)
      await tx
        .update(auctionSuppResponseEventHistory)
        .set({
          status: "Deleted",
          lastModifiedBy: user,
          lastModificationTime: new Date(),
        })
        .where(eq(auctionSuppResponseEventHistory.id, id));

      pendingNotificationAmount = targetHistory.auctionTotal != null
        ? String(targetHistory.auctionTotal)
        : null;

      // 🔥 5. Delete in FK-safe order: column values → rows → response event
      if (response) {
        // 5a. Fetch row IDs to delete their column values first
        const respRows = await tx
          .select({ id: auctionSuppResponseRow.id })
          .from(auctionSuppResponseRow)
          .where(eq(auctionSuppResponseRow.auctionSuppRespId, response.id));

        for (const { id: rowId } of respRows) {
          await tx
            .delete(auctionSuppEventResponseTemplateColumnValues)
            .where(eq(auctionSuppEventResponseTemplateColumnValues.auctionSuppRespRowId, rowId));
        }

        // 5b. Now safe to delete rows
        await tx
          .delete(auctionSuppResponseRow)
          .where(eq(auctionSuppResponseRow.auctionSuppRespId, response.id));

        // 5c. Finally delete the response event
        await tx
          .delete(auctionSuppResponseEvent)
          .where(eq(auctionSuppResponseEvent.id, response.id));
      }

      // 🔥 5b. If supplier had a previous bid, restore it so ranking includes it
      if (response) {
        const prevHistRows = await tx
          .select()
          .from(auctionSuppResponseEventHistory)
          .where(
            and(
              eq(auctionSuppResponseEventHistory.auctionId, auctionId),
              eq(auctionSuppResponseEventHistory.supplierId, supplierId),
              sql`${auctionSuppResponseEventHistory.status} <> 'Deleted'`
            )
          )
          .orderBy(sql`${auctionSuppResponseEventHistory.bidTime} DESC NULLS LAST`)
          .limit(1);

        const prevHist = prevHistRows[0];
        if (prevHist) {
          const [newResp] = await tx
            .insert(auctionSuppResponseEvent)
            .values({
              id: sql`nextval('dbo.au_auction_supp_event_response_id_seq'::regclass)`,
              auctionId: prevHist.auctionId,
              supplierId: prevHist.supplierId,
              auctionName: prevHist.auctionName,
              supplierName: prevHist.supplierName,
              supplierContact: prevHist.supplierContact,
              siteId: prevHist.siteId,
              supplierSite: prevHist.supplierSite,
              supplierContactNo: prevHist.supplierContactNo,
              supplierContactEmail: prevHist.supplierContactEmail,
              auctionTotal: prevHist.auctionTotal,
              suppRank: prevHist.suppRank,
              grossTotal: prevHist.grossTotal,
              version: prevHist.version,
              suppComments: prevHist.suppComments,
              templateId: prevHist.templateId,
              auctionType: prevHist.auctionType,
              orgId: prevHist.orgId,
              auctionStrategy: prevHist.auctionStrategy,
              auctionDuration: prevHist.auctionDuration,
              auctionDurationUnits: prevHist.auctionDurationUnits,
              isScheduledEvent: prevHist.isScheduledEvent,
              startTime: prevHist.startTime,
              endTime: prevHist.endTime,
              deliveryDate: prevHist.deliveryDate,
              allotmentType: prevHist.allotmentType,
              currency: prevHist.currency,
              status: prevHist.status,
              bidTime: prevHist.bidTime,
              creationTime: prevHist.creationTime,
              lastModificationTime: prevHist.lastModificationTime,
              createdBy: prevHist.createdBy,
              lastModifiedBy: prevHist.lastModifiedBy,
              attribute1: prevHist.attribute1 != null ? Number(prevHist.attribute1) : null,
              attribute2: prevHist.attribute2,
              attribute3: prevHist.attribute3,
              attribute4: prevHist.attribute4,
              attribute5: prevHist.attribute5,
              attribute6: prevHist.attribute6,
              attribute7: prevHist.attribute7,
              attribute8: prevHist.attribute8,
              attribute9: prevHist.attribute9,
              attribute10: prevHist.attribute10,
              attribute11: prevHist.attribute11,
              attribute12: prevHist.attribute12,
              attribute13: prevHist.attribute13,
              attribute14: prevHist.attribute14,
              attribute15: prevHist.attribute15,
              placeProxy: prevHist.placeProxy,
              isBasket: prevHist.isBasket,
              basketAuctionDuration: prevHist.basketAuctionDuration,
            } as any)
            .returning();

          // Restore response rows from history
          const histRows = await tx
            .select()
            .from(auctionSuppResponseRowHistory)
            .where(eq(auctionSuppResponseRowHistory.auSuppEventRespId, prevHist.id));

          for (const histRow of histRows) {
            const [newRow] = await tx
              .insert(auctionSuppResponseRow)
              .values({
                id: SUPP_RESP_ROW_ID_SEQ,
                auctionSuppRespId: newResp.id,
                templateId: histRow.templateId,
                auRowId: histRow.auRowId,
                lineItemTotal: histRow.lineItemTotal,
                lineItemBasePrice: histRow.lineItemBasePrice,
                suppProductRank: histRow.suppProductRank,
                savingsAmount: histRow.savingsAmount,
                basketAuctionStatus: histRow.basketAuctionStatus,
                createdBy: histRow.createdBy,
                creationTime: histRow.creationTime,
                lastModificationTime: histRow.lastModificationTime,
                lastModifiedBy: histRow.lastModifiedBy,
              } as any)
              .returning();

            // Restore column values
            const histColVals = await tx
              .select()
              .from(auctionSuppResponseColumnValuesHistory)
              .where(eq(auctionSuppResponseColumnValuesHistory.auSuppEventRespRowId, histRow.id));

            for (const colVal of histColVals) {
              await tx.insert(auctionSuppEventResponseTemplateColumnValues).values({
                id: SUPP_RESP_COL_VAL_ID_SEQ,
                auctionSuppRespRowId: newRow.id,
                columnId: colVal.columnId,
                columnValue: colVal.columnValue,
                columnKey: colVal.columnKey,
                suppRspColumnValue: colVal.suppRspColumnValue,
                createdBy: colVal.createdBy,
                creationTime: colVal.creationTime,
                lastModificationTime: colVal.lastModificationTime,
                lastModifiedBy: colVal.lastModifiedBy,
              } as any);
            }
          }
        }
      }

      // 🔥 6. Defer ranking recalculation until after commit — partialBasedResp/lotBasedResp
      // use getDb() (separate connection) and will block on row locks held by this tx.
      if (response && response.isBasket !== "Y") {
        pendingRecalc = {
          allotmentType: response.allotmentType || "",
          response,
          event,
        };
      }

      return `ok:${String(targetHistory.supplierName ?? "")}`;
    });

    // Early-return validation errors from the transaction
    if (typeof txResult === "string" && !txResult.startsWith("ok:")) {
      return txResult;
    }
    supplierName = String(txResult ?? "").replace(/^ok:/, "");

    if (pendingNotificationAmount != null) {
      try {
        const s = await vendorService.getDboSupplier(supplierId);
        const orgData = await adminRepo.getOrgDetails();
        if (s && s.emailId) {
          eventBus.publish({
            eventType: EventTypes.BID_DELETE_APPROVED,
            timestamp: new Date(),
            vendorName: s.companyName || "Vendor",
            auctionId: String(auctionId),
            amount: pendingNotificationAmount,
            receiverEmail: s.emailId,
            orgLogoPath: orgData.org_logo_path,
          });
        }
      } catch (err) {
        console.error("[Auction] Notification error in deleteResponse:", err);
      }
    }

    if (pendingRecalc) {
      const allResponses = await auctionEventResponseRepo.findByAuctionId(auctionId);
      const pr: any = pendingRecalc;
      if (pr.allotmentType === "Lot Based") {
        await lotBasedResp(
          pr.response,
          pr.event,
          pr.response,
          allResponses,
        );
      } else if (["Rank Auction", "Partial Based"].includes(pr.allotmentType)) {
        await partialBasedResp(
          pr.response,
          pr.event,
          pr.response,
          1,
          allResponses,
        );
      }
    }

    await emitAuctionUpdates(auctionId, supplierId);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Error deleting response:", msg);
    return `Error: ${msg}`;
  }

  // 🔹 8. Activity log — outside transaction to avoid nested-transaction pool issues
  await updateAuctionOrderActivity(
    auctionId,
    `Auction Response Deleted by Buyer: ${supplierName}`,
    user
  ).catch((e: any) => console.warn("[deleteResponse] Activity log failed:", e?.message));

  return "Success";
};

const emitAuctionUpdates = async (
  auctionId: number,
  supplierId: number
) => {

  // need to work 
  // Buyer stream
  // const buyerEmitter = emitters.get(`${auctionId}`);
  // if (buyerEmitter) {
  //   buyerEmitter.write(
  //     `event: AuctionDetails\ndata: ${JSON.stringify(
  //       await getAuctionEventDetailsById(auctionId)
  //     )}\n\n`
  //   );
  // }

  // Supplier stream
  // const suppEmitter = emitters.get(`${auctionId},${supplierId}`);
  // if (suppEmitter) {
  //   suppEmitter.write(
  //     `event: SuppAuctionDetails\ndata: ${JSON.stringify(
  //       await getAuctionEventDetailsBySupp(auctionId, supplierId)
  //     )}\n\n`
  //   );
  // }
};

export const lotBasedResp = async (
  currentResponse: any,
  event: any,
  updatedResponse: any,
  result: any[],
): Promise<number> => {
  let suppResponseCount = 1;

  if (result?.length) {
    let list = [...result]; // clone

    suppResponseCount = list.length;

    // 🔥 1. Sorting
    if (event.auctionType?.toLowerCase() === "reverse auction") {
      list.sort((a, b) => {
        const totalDiff =
          Number(a.auctionTotal || 0) - Number(b.auctionTotal || 0);

        if (totalDiff !== 0) return totalDiff;

        return new Date(a.bidTime).getTime() - new Date(b.bidTime).getTime();
      });
    } else if (event.auctionType?.toLowerCase() === "forward auction") {
      list.sort((a, b) => {
        const totalDiff =
          Number(b.auctionTotal || 0) - Number(a.auctionTotal || 0);

        if (totalDiff !== 0) return totalDiff;

        return new Date(a.bidTime).getTime() - new Date(b.bidTime).getTime();
      });
    }

    // 🔥 2. Ranking
    let rank = 1;

    for (const resp of list) {
      const auctionTotal = Number(resp.auctionTotal || 0);

      if (auctionTotal === 0) {
        await getDb()
          .update(auctionSuppResponseEvent)
          .set({ suppRank: 0 })
          .where(eq(auctionSuppResponseEvent.id, resp.id));

        continue;
      }

      // need to work 
      // 🔥 Notify if rank changed
      if (resp.suppRank !== 0 && resp.suppRank !== rank) {
        // await pushNotificationService.sendNotificationsForSupplierUpdate(
        //   "Auction Rank Updated",
        //   resp,
        //   "Bid Updated"
        // );
      }

      // 🔹 Update rank
      await getDb()
        .update(auctionSuppResponseEvent)
        .set({ suppRank: rank })
        .where(eq(auctionSuppResponseEvent.id, resp.id));

      // 🔹 Update in-memory object
      if (
        updatedResponse &&
        updatedResponse.auctionId === resp.auctionId &&
        updatedResponse.supplierId === resp.supplierId
      ) {
        updatedResponse.suppRank = rank;
      }

      rank++;
    }
  } else {
    // 🔥 Only one response
    suppResponseCount = 1;

    if (updatedResponse && currentResponse) {
      let rank = 1;

      if (Number(updatedResponse.auctionTotal || 0) === 0) {
        rank = 0;
      }

      currentResponse.suppRank = rank;
      updatedResponse.suppRank = rank;

      // Persist rank to DB for the single-response case
      if (updatedResponse.id) {
        await getDb()
          .update(auctionSuppResponseEvent)
          .set({ suppRank: rank })
          .where(eq(auctionSuppResponseEvent.id, updatedResponse.id));
      }

      //need to work
      // await pushNotificationService.sendNotificationsForSupplierUpdate(
      //   "Auction Rank Updated",
      //   currentResponse,
      //   "Bid Updated"
      // );
    }
  }

  return suppResponseCount;
};

export const partialBasedResp = async (
  currentResponse: any,     // auAuctionSuppResponseEvent
  event: any,               // AuAuctionEvent
  updatedResponse: any,     // auctionSuppResponseEvent
  suppResponseCount: number,
  result: any[]             // Optional<List<...>>
): Promise<number> => {
  let respRows: any[] = [];

  // 🔥 1. Truncate base price (2 decimals FLOOR)
  const updatedRows = (currentResponse.templateResponseRows || []).map(
    (row: any) => {
      if (row.lineItemBasePrice != null) {
        row.lineItemBasePrice = Math.floor(
          Number(row.lineItemBasePrice) * 100
        ) / 100;
      }
      return row;
    }
  );

  updatedResponse.templateResponseRows = updatedRows;

  // 🔥 2. Collect all rows from all responses
  if (result?.length) {
    suppResponseCount = result.length;

    for (const respEvent of result) {
      respRows.push(...(respEvent.templateResponseRows || []));
    }

    // 🔥 Fallback: responses exist but were fetched without nested rows (flat SELECT).
    // Directly query the row table so grouping/ranking has data to work with.
    if (respRows.length === 0) {
      const auctionId = currentResponse.auctionId ?? event.id;
      if (auctionId) {
        const flatRows = await auctionEventResponseRowRepo.findSuppRespRow(Number(auctionId));
        // Convert snake_case DB columns → camelCase expected by ranking logic
        respRows = flatRows.map((r: any) => ({
          id: r.id,
          auRowId: r.au_row_id,
          auSuppEventRespId: r.au_supp_event_resp_id,
          lineItemTotal: r.line_item_total,
          lineItemBasePrice: r.line_item_base_price,
          suppProductRank: r.supp_product_rank,
          basketAuctionStatus: r.basket_auction_status,
        }));
      }
    }
  }

  // 🔥 3. Group by auRowId
  if (respRows.length) {
    const grouped = new Map<number, any[]>();

    for (const row of respRows) {
      const key = row.auRowId;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    }

    // 🔥 4. Process each group
    for (const [rowId, list] of Array.from(grouped.entries())) {
      // For serial/basket auctions, skip items that haven't started yet
      if (event.isBasket === "Y") {
        const status = list[0]?.basketAuctionStatus;
        if (status === "Open" || String(status ?? "").toLowerCase() === "open") {
          continue;
        }
      }

      const filtered: typeof list = list.filter(
        (r: any) => r.lineItemTotal && Number(r.lineItemTotal) !== 0
      );

      // 🔥 Sort ascending
      filtered.sort(
        (a: any, b: any) => Number(a.lineItemTotal) - Number(b.lineItemTotal)
      );

      // =========================
      // 🔥 REVERSE AUCTION
      // =========================
      if (event.auctionType?.toLowerCase() === "reverse auction") {
        let rank = 0;

        for (const resp of filtered) {
          rank++;

          if (
            resp.suppProductRank != null &&
            resp.suppProductRank !== rank
          ) {
            // need to work
            // await pushNotificationService.sendNotificationsForSupplierUpdate(
            //   "Auction Rank Updated",
            //   resp.auSuppEventRespId,
            //   "Bid Updated"
            // );
          }

          // 🔹 Update DB
          await getDb()
            .update(auctionSuppResponseRow)
            .set({ suppProductRank: rank })
            .where(eq(auctionSuppResponseRow.id, resp.id));

          resp.suppProductRank = rank;

          // 🔹 Update current response rows
          if (updatedResponse) {
            for (const suppRow of updatedResponse.templateResponseRows || []) {
              if (
                suppRow.auRowId === resp.auRowId &&
                suppRow.auSuppEventRespId?.supplierId ===
                  updatedResponse.supplierId
              ) {
                suppRow.suppProductRank = rank;
              }
            }
          }
        }
      }

      // =========================
      // 🔥 FORWARD AUCTION
      // =========================
      else if (event.auctionType?.toLowerCase() === "forward auction") {
        let rank = filtered.length + 1;

        for (const resp of filtered) {
          rank--;

          if (
            resp.suppProductRank != null &&
            resp.suppProductRank !== rank
          ) {
            //need to work
            // await pushNotificationService.sendNotificationsForSupplierUpdate(
            //   "Auction Rank Updated",
            //   resp.auSuppEventRespId,
            //   "Bid Updated"
            // );
          }

          await getDb()
            .update(auctionSuppResponseRow)
            .set({ suppProductRank: rank })
            .where(eq(auctionSuppResponseRow.id, resp.id));

          resp.suppProductRank = rank;

          for (const suppRow of updatedResponse.templateResponseRows || []) {
            if (
              suppRow.auRowId === resp.auRowId &&
              suppRow.auSuppEventRespId?.supplierId ===
                updatedResponse.supplierId
            ) {
              suppRow.suppProductRank = rank;
            }
          }
        }
      }
    }
  }

  // 🔥 5. No result case
  else {
    suppResponseCount = 1;

    if (updatedResponse && currentResponse) {
      for (const row of updatedResponse.templateResponseRows || []) {
        if (row.lineItemTotal && Number(row.lineItemTotal) !== 0) {
          row.suppProductRank = 1;
        }
      }

      for (const row of currentResponse.templateResponseRows || []) {
        row.suppProductRank = 1;

        // need to work
        // await pushNotificationService.sendNotificationsForSupplierUpdate(
        //   "Auction Rank Updated",
        //   row.auSuppEventRespId,
        //   "Bid Updated"
        // );

        await getDb()
          .update(auctionSuppResponseRow)
          .set({ suppProductRank: 1 })
          .where(eq(auctionSuppResponseRow.id, row.id));
      }
    }
  }

  return suppResponseCount;
};


export const getAuctionEventDetailsBySupp = async (
  auctionId: number,
  suppId: number
): Promise<any> => {
  await repo.updateStatus();

  let eventDetails: any = null;

  if (auctionId && suppId) {
    const event = await getAuctionEventById(auctionId);
    const tncMappings = await repo.getTnCMappingsForEvent(auctionId);

    if (event) {
      eventDetails = {};

      // 🔹 Basic Mapping
      eventDetails.name = event.name;
      eventDetails.id = event.id;
      eventDetails.createdBy = event.createdBy;
      eventDetails.lastModifiedBy = event.lastModifiedBy;
      eventDetails.creationTime = event.creationTime;
      eventDetails.lastModificationTime = event.lastModificationTime;
      eventDetails.templateId = event.templateId;
      eventDetails.auctionType = event.auctionType;
      eventDetails.auctionStrategy = event.auctionStrategy;
      eventDetails.allotmentType = event.allotmentType;
      eventDetails.auctionDuration = event.auctionDuration;
      eventDetails.auctionDurationUnits = event.auctionDurationUnits;
      eventDetails.auctionSavingMeasure = event.auctionSavingMeasure;
      eventDetails.auctionSavingReference = event.auctionSavingReference;
      eventDetails.auctionSavingReferenceValue =
        event.auctionSavingReferenceValue;
      eventDetails.acutiontTimeExtensionInMins =
        event.acutiontTimeExtensionInMins;
      eventDetails.startTime = event.startTime;
      eventDetails.endTime = event.endTime;
      eventDetails.deliveryDate = event.deliveryDate;
      eventDetails.ifBidInLastMinutesInMins =
        event.ifBidInLastMinutesInMins;
      eventDetails.currency = event.currency;
      eventDetails.status = event.status;
      eventDetails.auctionWithdraw = event.isAuctionWithdraw;
      eventDetails.auctionWithdrawReason = event.auctionWithdrawReason;
      eventDetails.broadCastMsg = event.broadCastMessage;
      eventDetails.isBasket = event.isBasket;
      eventDetails.ifBidInLastMinutesInMinsUnit =
        event.ifBidInLastMinutesInMinsUnits;
      eventDetails.acutiontTimeExtensionInMinsUnit =
        event.acutiontTimeExtensionInMinsUnits;
      eventDetails.basketAuctionDuration = event.basketAuctionDuration;
      eventDetails.serverDate = new Date();

      // 🔹 Org Details
      try {
        eventDetails.orgDetails = await resolveAuctionOrgDetails(event.orgId);
      } catch (e) {}

      // 🔹 Supplier Mapping
      try {
        const suppList =
          ((event as { suppIds?: unknown }).suppIds as any[]) || [];
        eventDetails.auctionEventSuppMapping = suppList.filter(
          (s: any) => s.suppId === suppId
        );

        const supp = await vendorService.getDboSupplier(suppId);
        eventDetails.suppIds = [supp];
      } catch (e) {}

      // 🔹 TNC
      try {
        const tncMapping: any[] = tncMappings || [];
        const tncIds = tncMapping
          .map((t: any) => t?.tncId ?? t?.tnc_id)
          .map((id: any) => Number(id))
          .filter((id: number) => Number.isFinite(id) && id > 0);
        if (tncIds.length) {
          let terms =  await adminMgmtService.getTermsAndConditionsByIds(tncIds);
          eventDetails.tncs = terms;
        } else {
          eventDetails.tncs = [];
        }
      } catch (e) {
        console.error("Error in getAuctionEventDetailsBySupp", e);
      }

      // 🔹 Delete Request Status
      const delReqStatus =
        await auctionEventResponseHistoryRepo.getLatestRecordDetailsStatus(
          auctionId,
          suppId
        );

      if (delReqStatus) {
        if (!delReqStatus.attribute9) {
          delReqStatus.attribute9 = "N";
        }

        if (
          delReqStatus.attribute9 === "Y" ||
          delReqStatus.status === "Deleted"
        ) {
          eventDetails.delReqStatus = "Y";
        }
      }

      // 🔥 LOT LEADING PRICE
      let lotLeadingPrice: any = null;

      if (event.auctionStrategy === "Price Auction") {
        const responses =
          await auctionEventResponseRepo.findByAuctionId(auctionId);

        if (responses?.length > 1) {
          if (event.auctionType === "Reverse Auction") {
            lotLeadingPrice =
              await auctionEventResponseRepo.findLotLeadingPrice(
                auctionId
              );
          } else {
            lotLeadingPrice =
              await auctionEventResponseRepo.findLotLeadingPriceForwardAuction(
                auctionId
              );
          }

          if (lotLeadingPrice?.auctionTotal && Number(lotLeadingPrice.auctionTotal) > 0) {
            eventDetails.lotLeadingPrice = lotLeadingPrice.auctionTotal.toString();
          } else {
            eventDetails.lotLeadingPrice = "0";
          }
        } else if (responses?.length === 1) {
          eventDetails.lotLeadingPrice =
            responses[0].auctionTotal?.toString() || "";

          if (Number(responses[0].auctionTotal) > 0) {
            lotLeadingPrice = responses[0];
          }
        }
      }

      // 🔹 Supplier Responses (include line rows + column values for proxy / supplier UI)
      const suppResponsesRaw =
        await auctionEventResponseRepo.findByAuctionSuppId(auctionId, suppId);
      const suppResponses: any[] = [];
      if (suppResponsesRaw?.length) {
        for (const r of suppResponsesRaw) {
          const full = await getDb().query.auctionSuppResponseEvent.findFirst({
            where: eq(auctionSuppResponseEvent.id, r.id),
            with: {
              templateResponseRows: {
                with: {
                  columnResponseValues: true,
                },
              },
            },
          });
          suppResponses.push(full ?? r);
        }
        eventDetails.auAuctionSuppResponseEventList = suppResponses;
      }

      // 🔹 TEMPLATE ROW BUILD — `getAuctionEventById` does not hydrate relations; load line items like buyer `getAuctionEventDetailsById`.
      const lineItemMappings =
        await repo.getTemplateRowsWithColumnValuesForEvent(auctionId);

      let auctionRows: any[] = [];

      const templateRaw = await getEventTemplateById(Number(event.templateId));
      const template = templateRaw
        ? normalizeAuctionTemplateForDetails(templateRaw)
        : null;
      const columnDefs = template?.auAuctionEventTemplateColumnDefs ?? [];

      for (const mapping of lineItemMappings) {
        const row: any = {};
        row.auRowId = mapping.id;
        row.suppWiseCap = mapping.suppWiseCap;

        let respRows: any[] = [];

        if (suppResponses) {
          for (const resp of suppResponses) {
            for (const r of resp.templateResponseRows as any[] || []) {
              if (r.auRowId === mapping.id) {
                respRows.push(r);
                row.suppProductRank = r.suppProductRank;
              }
            }
          }
        }

        // 🔹 Columns (values from event template row mapping, same source as buyer details)
        const rowColumns: any[] = [];
        const columnValues = mapping.columnValues || [];

        for (const columnDef of columnDefs as any[]) {
          const col: any = {};

          col.columnId = columnDef.columnId;
          col.columnKey = columnDef.columnName;
          col.editableBy = columnDef.editableBy;
          col.viewedBy = columnDef.viewedBy;
          col.columnValue = getValueForKey(columnValues, columnDef.columnId);

          rowColumns.push(col);
        }

        row.auctionEventRowColumn = rowColumns;
        row.startTime = mapping.startTime;
        row.endTime = mapping.endTime;
        row.basketAuctionStatus = mapping.basketAuctionStatus;

        auctionRows.push(row);
      }

      eventDetails.templateRows = auctionRows;

      if (template) {
        eventDetails.templateDef = template;
      }

      // need to work
      // 🔥 SSE PUSH
      const key = `${auctionId},${suppId}`;
      // const emitter = emitters.get(key);

      // if (emitter) {
      //   emitter.write(
      //     `event: SuppAuctionDetails\n` +
      //       `data: ${JSON.stringify(eventDetails)}\n\n`
      //   );
      // }
    }
  }

  return eventDetails;
};

function parseAwardLineIds(awardLinesStr: unknown): Set<string> {
  if (typeof awardLinesStr !== "string" || !awardLinesStr.trim()) return new Set();
  return new Set(
    awardLinesStr
      .split("~")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function parseQuantity(raw: unknown): { qty: number; unit: string } {
  const text = String(raw ?? "").trim();
  if (!text) return { qty: 1, unit: "Each" };
  const parts = text.split(/\s+/);
  const qty = Number(parts[0]);
  const unit = parts[1] || "Each";
  return {
    qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
    unit,
  };
}

export async function createPOFromAward(
  awardBidHeaderDTO: any,
  sessionUser?: any
): Promise<string> {
  try {
    const awardId = Number(awardBidHeaderDTO?.awardNumber);
    if (!Number.isFinite(awardId) || awardId <= 0) {
      return "Error: Invalid award number";
    }

    const now = new Date();
    const userName =
      String(
        sessionUser?.name ??
          sessionUser?.fullName ??
          sessionUser?.userName ??
          sessionUser?.emailId ??
          "SYSTEM"
      ) || "SYSTEM";
    const userId = sessionUser?.id != null ? String(sessionUser.id) : null;
    const userEmail = sessionUser?.emailId ?? sessionUser?.email ?? null;

    return await getDb().transaction(async (tx) => {
      const award = await auctionEventAwardRepo.findById(awardId);
      if (!award) return "ERROR";

      const eventDetails = await getAuctionEventDetailsById(Number(award.auctionId));
      if (!eventDetails) return "ERROR";

      const locationId =
        awardBidHeaderDTO?.deliverToLocationId != null
          ? Number(awardBidHeaderDTO.deliverToLocationId)
          : null;
      let locationName = "";
      let shipToAddress: string | null = null;
      let billToAddress: string | null = null;
      if (locationId && Number.isFinite(locationId)) {
        const locRs = await tx.execute(sql`
          SELECT location_name, shipto_address, billto_address
          FROM dbo.am_locations_mst
          WHERE id = ${locationId}
          LIMIT 1
        `);
        const loc = (locRs.rows?.[0] as any) ?? null;
        locationName = loc?.location_name ?? "";
        shipToAddress = loc?.shipto_address ?? null;
        billToAddress = loc?.billto_address ?? null;
      }

      let orgId: number | null = null;
      const budgetSegment = awardBidHeaderDTO?.budgetSegment;
      if (budgetSegment != null && String(budgetSegment).trim() !== "") {
        const budLineRs = await tx.execute(sql`
          SELECT budget_mst_id
          FROM dbo.am_budget_lines
          WHERE id = ${Number(budgetSegment)}
          LIMIT 1
        `);
        const budgetMstId = (budLineRs.rows?.[0] as any)?.budget_mst_id;
        if (budgetMstId != null) {
          const budMstRs = await tx.execute(sql`
            SELECT business_entity
            FROM dbo.am_budget_mst
            WHERE id = ${Number(budgetMstId)}
            LIMIT 1
          `);
          const be = (budMstRs.rows?.[0] as any)?.business_entity;
          const parsed = Number(be);
          orgId = Number.isFinite(parsed) ? parsed : null;
        }
      }

      let requestorId: string | null = null;
      let requestorName: string | null = null;
      let requestorEmail: string | null = null;
      if (awardBidHeaderDTO?.requestorId != null && awardBidHeaderDTO.requestorId !== "") {
        const reqUserRs = await tx.execute(sql`
          SELECT id, name, email_id
          FROM dbo.um_user_dtls
          WHERE id = ${Number(awardBidHeaderDTO.requestorId)}
          LIMIT 1
        `);
        const reqUser = (reqUserRs.rows?.[0] as any) ?? null;
        if (reqUser) {
          requestorId = String(reqUser.id);
          requestorName = reqUser.name ?? null;
          requestorEmail = reqUser.email_id ?? null;
        }
      }

      const supplierId = Number(awardBidHeaderDTO?.supplierId ?? award?.supplierId);
      if (!Number.isFinite(supplierId) || supplierId <= 0) {
        return "Error: Supplier not found";
      }

      const suppRs = await tx.execute(sql`
        SELECT id, company_name
        FROM dbo.supp_basic_org_dtls
        WHERE id = ${supplierId}
        LIMIT 1
      `);
      const supplier = (suppRs.rows?.[0] as any) ?? null;
      if (!supplier) return "Error: Supplier not found";

      const prefixRs = await tx.execute(sql`
        SELECT prefix_value
        FROM dbo.am_prefix_mst
        WHERE UPPER(TRIM(prefix_name)) IN ('PURCHASE ORDER', 'PO')
          AND status = 'Active'
        LIMIT 1
      `);
      const prefix = String((prefixRs.rows?.[0] as any)?.prefix_value ?? "PO").trim() || "PO";

      const maxPoRs = await tx.execute(sql`
        SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(po_number, '^.*_', '') AS INTEGER)), 0) AS max_seq
        FROM dbo.supp_po_header_dtls
        WHERE po_number ~ '^.+_[0-9]+$'
      `);
      const maxSeq = Number((maxPoRs.rows?.[0] as any)?.max_seq ?? 0);
      const poNumber = `${prefix}_${String(maxSeq + 1).padStart(5, "0")}`;

      let requiredDate: Date | null = null;
      if (awardBidHeaderDTO?.deliveryDate) {
        const d = new Date(awardBidHeaderDTO.deliveryDate);
        if (!Number.isNaN(d.getTime())) requiredDate = d;
      }

      await tx.execute(sql`
        INSERT INTO dbo.supp_po_header_dtls (
          po_number, po_description, po_type, po_status,
          supplier_id, company_name,
          buyer, buyer_name, buyer_email,
          po_owner_id, po_owner_name, po_owner_email,
          department_name, po_currency,
          delivertto_location_id, delivertto_location_name,
          shipto_address, billto_address,
          po_required_date, creation_date, po_issue_date,
          budget_name, budget_segment, org_id,
          po_payment_terms_id, payment_terms_name,
          advance_flag, advance_percentage,
          pr_number, created_by, last_modified_by, last_modified_date
        ) VALUES (
          ${poNumber},
          ${String(awardBidHeaderDTO?.awardDescription ?? "")},
          'STANDARD',
          'Draft',
          ${supplier.id},
          ${supplier.company_name ?? null},
          ${userId},
          ${userName},
          ${userEmail},
          ${requestorId},
          ${requestorName},
          ${requestorEmail},
          ${String(awardBidHeaderDTO?.departmentName ?? "")},
          ${String(awardBidHeaderDTO?.awardCurrency ?? eventDetails.currency ?? "INR")},
          ${locationId},
          ${locationName},
          ${shipToAddress},
          ${billToAddress},
          ${requiredDate},
          ${now},
          ${now},
          ${awardBidHeaderDTO?.budgetName ?? null},
          ${awardBidHeaderDTO?.budgetSegment != null ? String(awardBidHeaderDTO.budgetSegment) : null},
          ${orgId},
          ${awardBidHeaderDTO?.termsId != null ? String(awardBidHeaderDTO.termsId) : null},
          ${awardBidHeaderDTO?.paymentTerms ?? null},
          ${awardBidHeaderDTO?.advanceFlag ?? "N"},
          ${awardBidHeaderDTO?.advancePercentage != null && String(awardBidHeaderDTO.advancePercentage) !== ""
            ? Number(awardBidHeaderDTO.advancePercentage)
            : null},
          '',
          ${userName},
          ${userName},
          ${now}
        )
      `);

      const rowsRs = await tx.execute(sql`
        SELECT
          r.id AS award_row_id,
          r.au_row_id,
          r.line_item_total,
          r.line_item_base_price,
          c.id AS col_id,
          c.column_id,
          c.column_key,
          c.column_value,
          c.supp_rsp_column_value
        FROM dbo.au_auction_supp_award_event_row r
        LEFT JOIN dbo.au_auction_supp_award_event_template_column_values c
          ON c.au_supp_event_award_row_id = r.id
        WHERE r.au_supp_event_award_id = ${awardId}
        ORDER BY r.id ASC, c.id ASC
      `);

      const selectedAuRowIds = parseAwardLineIds(awardBidHeaderDTO?.awardLinesStr);
      const templateDefMap = new Map<string, string>();
      for (const def of eventDetails?.templateDef?.auAuctionEventTemplateColumnDefs ?? []) {
        const key = String(def?.columnId ?? "").trim();
        if (!key) continue;
        templateDefMap.set(key, String(def?.columnName ?? ""));
      }

      const grouped = new Map<number, any>();
      for (const raw of rowsRs.rows as any[]) {
        const rowId = Number(raw.award_row_id);
        if (!grouped.has(rowId)) {
          grouped.set(rowId, {
            awardRowId: rowId,
            auRowId: raw.au_row_id,
            lineItemTotal: raw.line_item_total,
            lineItemBasePrice: raw.line_item_base_price,
            columns: [] as any[],
          });
        }
        if (raw.col_id != null) {
          grouped.get(rowId).columns.push({
            columnId: raw.column_id,
            columnKey:
              raw.column_key ??
              templateDefMap.get(String(raw.column_id ?? "")) ??
              null,
            columnValue: raw.column_value,
            suppRspColumnValue: raw.supp_rsp_column_value,
          });
        }
      }

      let allRows = Array.from(grouped.values());
      if (selectedAuRowIds.size > 0) {
        allRows = allRows.filter((r) => selectedAuRowIds.has(String(r.auRowId ?? "")));
      }
      if (!allRows.length) return "Error: Award has no line items";

      const nextLineIdRs = await tx.execute(sql`
        SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM dbo.supp_po_line_dtls
      `);
      let nextLineId = Number((nextLineIdRs.rows?.[0] as any)?.next_id ?? 1);

      let poNetCost = 0;
      let poTaxTotal = 0;
      let poTotalCost = 0;

      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];

        const colByName = new Map<string, any>();
        for (const col of row.columns as any[]) {
          const key = String(col.columnKey ?? "").trim().toLowerCase();
          if (key) colByName.set(key, col);
        }

        const itemCol = colByName.get("item name");
        const qtyCol = colByName.get("quantity");
        const priceCol = colByName.get("price");
        const totalCol = colByName.get("total");

        const itemNameRaw = itemCol?.columnValue ?? `Auction Item ${i + 1}`;
        const itemName = String(itemNameRaw).trim() || `Auction Item ${i + 1}`;
        const parsedQty = parseQuantity(qtyCol?.columnValue);

        const priceFromSuppRsp = Number(priceCol?.suppRspColumnValue);
        const priceFromValue = Number(priceCol?.columnValue);
        const basePrice = Number(row.lineItemBasePrice);
        const totalFromRow = Number(row.lineItemTotal);
        const totalFromCol = Number(totalCol?.suppRspColumnValue ?? totalCol?.columnValue);

        const unitPrice =
          (Number.isFinite(priceFromSuppRsp) && priceFromSuppRsp > 0
            ? priceFromSuppRsp
            : Number.isFinite(priceFromValue) && priceFromValue > 0
            ? priceFromValue
            : Number.isFinite(basePrice) && basePrice > 0
            ? basePrice
            : Number.isFinite(totalFromRow) && totalFromRow > 0
            ? totalFromRow / parsedQty.qty
            : 0);

        let lineCost = parsedQty.qty * unitPrice;
        if (!(Number.isFinite(lineCost) && lineCost > 0)) {
          lineCost =
            Number.isFinite(totalFromRow) && totalFromRow > 0
              ? totalFromRow
              : Number.isFinite(totalFromCol) && totalFromCol > 0
              ? totalFromCol
              : 0;
        }

        // Keep legacy-like discount meaning when base price exists.
        const baseTotal = (Number.isFinite(basePrice) ? basePrice : 0) * parsedQty.qty;
        const discount = Number.isFinite(totalFromRow) ? totalFromRow - baseTotal : 0;

        const itemId = String(row.auRowId ?? 0);
        const poLineNumber = String(i + 1);

        await tx.execute(sql`
          INSERT INTO dbo.supp_po_line_dtls
            (id, po_number, po_line_number, line_description, line_qty, line_unit_cost, line_unit, line_curr,
             tax_rate, tax_rate_code, taxable_flag, tax_amount, line_cost, line_status,
             item_id, item_name, product_category, product_category_name, creation_date,
             created_by, last_modified_by, last_modified_date)
          VALUES
            (${nextLineId}, ${poNumber}, ${poLineNumber}, ${itemName}, ${parsedQty.qty}, ${unitPrice}, ${parsedQty.unit},
             ${String(awardBidHeaderDTO?.awardCurrency ?? eventDetails.currency ?? "INR")},
             0, null, 'N', 0, ${lineCost}, 'Draft',
             ${itemId}, ${itemName}, null, null, ${now},
             ${userName}, ${userName}, ${now})
        `);

        await tx.execute(sql`
          UPDATE dbo.supp_po_line_dtls
          SET discount = ${discount}, attribute_15 = ${String(row.auRowId ?? "")}
          WHERE id = ${nextLineId}
        `);

        await tx.execute(sql`
          UPDATE dbo.au_auction_supp_award_event_row
          SET attribute11 = ${poNumber}
          WHERE id = ${row.awardRowId}
        `);

        poNetCost += lineCost;
        poTotalCost += lineCost;
        nextLineId += 1;
      }

      await tx.execute(sql`
        UPDATE dbo.supp_po_header_dtls
        SET po_net_cost = ${poNetCost},
            po_tax = ${poTaxTotal},
            po_total_cost = ${poTotalCost},
            bid_award_id = ${String(awardId)},
            attribute_11 = ${String(awardId)},
            last_modified_by = ${userName},
            last_modified_date = ${now}
        WHERE po_number = ${poNumber}
      `);

      const currentAwardPo = String((award as any).attribute11 ?? "").trim();
      const nextAwardPo =
        currentAwardPo.length > 0 ? `${currentAwardPo} ,${poNumber}` : poNumber;

      await tx.execute(sql`
        UPDATE dbo.au_auction_supp_award_event
        SET attribute11 = ${nextAwardPo},
            lastModificationTime = ${now},
            lastModifiedBy = ${userName}
        WHERE id = ${awardId}
      `);

      logAudit({
        auditKey: poNumber,
        auditAction: "CREATE",
        auditMessage: "PO Created from Bid Award",
        fullName: userName,
        userId: userId || "system",
        module: "PO",
      }).catch((err: any) => console.error("[Audit] Failed to log:", err?.message));

      return poNumber;
    });
  } catch (err) {
    console.error("createPOFromAward error:", err);
    return "ERROR";
  }
}
export async function submitAuctionAwardApprovalPartial(auctionAwardNo: number, awardNotes: string, loggedInUser: any): Promise<string> {
  if (!auctionAwardNo) {
    return "Error: Auction Award No. is mandatory.";
  }

  try {
    const award = await getAwardDetails(auctionAwardNo);
    if (!award || !award.id) {
      return "Error : Event is not mapped correctly";
    }

    const event = await getAuctionEventById(Number(award.auctionId));
    if (!event || !event.id) {
      return "Error : Event is not mapped correctly";
    }

    const user = helperUtils.getLoggedInUser(request) || "SYSTEM";
    if (!user) {
      return "Error : Event is not mapped correctly";
    }

    // Build item names from award rows
    let name = "";
    if (Array.isArray(award.templateAwardRows)) {
      for (const aRow of award.templateAwardRows as any[]) {
        if (aRow.columnAwardValues) {
          for (const aColumn of aRow.columnAwardValues) {
            if (aColumn.columnKey === "Item Name") {
              name += aColumn.columnValue + " , ";
            }
          }
        }
      }
    }

    const processName = "Auction";
    const taskSubject = `Auction Award Request to - ${event.name} for the Products are ${name}`;
    const taskSubject1 = taskSubject.length > 80 ? taskSubject.substring(0, 80) : taskSubject;

    const params: any = {
      subject: taskSubject1,
      srmsRefNumber: String(award.id),
      status: "Pending Approval",
      startDate: new Date().getTime(),
      createdBy: user,
      organization: "",
      department: "",
      orgId: event.orgId || 0,
    };

    // Fetch org details
    if (event.orgId) {
      try {
        const org = await srmUserMgmtService.getOrgById(Number(event.orgId));
        params.organization = org?.organization_name || org?.organizationName || "";
        params.department = ""; 
      } catch (err) {
        
      }
    }

    // Calculate amount
    if (award.auctionTotal != null) {
      let amount = 0;
      if (Array.isArray(award.templateAwardRows) && award.templateAwardRows.length > 0) {
        amount = award.templateAwardRows.reduce((sum:any, row:any) => sum + Number(row.lineItemTotal || 0), 0);
      }

      try {
        const mainOrg = await adminMgmtService.getOrgDetails();
        const exRate = await repo1.getExchangeRate(event.currency as string, mainOrg.currency);
        if (exRate?.conversionRate != null) {
          amount *= Number(exRate.conversionRate);
        }
      } catch (err) {
        console.warn("Exchange rate lookup failed", err);
      }
      params.Amount = String(amount);
    } else {
      params.Amount = "0";
    }

    // Check approvers
    const checkApprList = await workflowService.getFirstStepApproversList(processName, params);
    if (!checkApprList || checkApprList.length === 0) {
      return "Error-Approver Heirarchy or Approval Flow is not defined for this request!";
    }

    // Start process
    const taskId = await workflowService.startProcess(taskSubject1, processName, String(award.id), params,user);

    if (!taskId) {
      return "Error: Workflow process did not return task id";
    }

    // Update award
    const approverNames = await workflowService.getApproversList(processName, params);
    await getDb().update(auctionSuppAwardEvent)
      .set({
        status: "Pending Approval",
        attribute12: taskId,
        approversList: Array.isArray(approverNames) ? approverNames.join(", ") : "",
        notes: awardNotes,
        lastModificationTime: new Date(),
        lastModifiedBy: user,
      })
      .where(eq(auctionSuppAwardEvent.id, Number(award.id)));
    const orgData = await adminRepo.getOrgDetails();
    // Publish event
    const approverEmail = await getDb().execute(sql`select current_assignee from dbo.wf_step_instance where task_id=${taskId}`);
    const appUrl = await getDb().execute(sql`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
    const apiKey = await getDb().execute(sql`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);
    const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(String(apiKey.rows[0].prop_value))}&&module=${encodeURIComponent('auction partial')}&&taskId=${encodeURIComponent(taskId)}&&email=${encodeURIComponent(String(approverEmail.rows[0].current_assignee))}&&refnumber=${encodeURIComponent(auctionAwardNo)}`;
    
    // const taskAssEvent: WorkflowTaskAssignedEvent = {
    //   eventType: EventTypes.TASK_ASSIGNMENT.AUCTION_AWARD_APP,
    //   timestamp: new Date(),
    //   taskId,
    //   taskName: taskSubject1,
    //   refNumber: String(award.id),
    //   refType: "AuctionAward",
    //   assigneeEmail: "",
    //   assigneeName: user,
    //   orgLogoPath: orgData.org_logo_path,
    //   emailApprovalLink:approvalLink,
    // };
    // eventBus.publish(taskAssEvent);

    const userObj = await srmUserMgmtService.getLoggedInUser(loggedInUser.email);
      publishTaskAssignmentEvent({
          taskId: taskId,
          templateEventId: "AUCTION_AWARD_APP",
          taskSub: `Auction award request for ${award.auctionName}`,
          submittedBy:  userObj?.name,
          department: userObj?.departmentName || userObj?.department_name || "",
          entityId: award.id?.toString(),
          srmsRefNo: award.id?.toString(),
          domain: loggedInUser?.domain,
          variables: {
              orgLogoPath: orgData.org_logo_path,
              domain: loggedInUser?.domain,
              emailApprovalLink: approvalLink,
          },
      });

    

    return "Success";
  } catch (err: any) {
    console.error("Error in submitAuctionAwardApprovalPartial:", err);
    return `Error: ${err.message || err}`;
  }
}

export async function processAwardApprPartial(taskId: string, result: any, comments: any, auctionAwardId: any, delegatedUser: any, sessionUser: any) {
   try {
    // 🔹 Logged-in user
    const loggedInUsername =
      (sessionUser as any)?.user_name ??
      (sessionUser as any)?.userName ??
      (sessionUser as any)?.email_id ??
      (sessionUser as any)?.email ??
      (typeof sessionUser === "string" ? sessionUser : null);
    if (!loggedInUsername) return "Error: Logged-in user is missing";
    const userObj = await srmUserMgmtService.getLoggedInUser(loggedInUsername);
    if (!userObj) return "Error: Logged-in user not found";

    // 🔹 Fetch Award + Event
    const award = await auctionEventAwardRepo.findById(Number(auctionAwardId));
    if (!award) throw new Error("Award not found");
    const orgData = await adminRepo.getOrgDetails();

    const event: any = await repo.getAuctionEventById(
      Number(award.auction_id)
    );

    // 🔹 Build Item Names
    const name = (award.templateAwardRows as any[] || [])
      .flatMap((row: any) =>
        (row.columnAwardValues || [])
          .filter((col: any) => col.columnKey === "Item Name")
          .map((col: any) => col.columnValue)
      )
      .join(" , ");

    // 🔹 Workflow Step Instances
    const wfStepInstances = await workflowService.findByTaskId(taskId);
    const userRoles = await srmUserMgmtService.getUserRoles(userObj.id);

    const roleNames = userRoles.map((role: any) => role.role_name);
    // 🔹 Complete Workflow Task
    const nextTaskId = await workflowService.completeTask(taskId,
      result as "Approve" | "Reject" | "ReSubmit" | "More",
      comments, userObj.user_name ?? userObj.userName, roleNames );


    console.log("Next Task Id:", nextTaskId);

    // =========================================================
    // 🔥 CASE 1: NEXT TASK EXISTS (Intermediate Approval)
    // =========================================================
    if (nextTaskId) {
      await auctionEventAwardRepo.update(Number(award.id), {
        attribute12: nextTaskId,
      });

      const approverEmail = await getDb().execute(sql`select current_assignee from dbo.wf_step_instance where task_id=${taskId}`);
      const appUrl = await getDb().execute(sql`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
      const apiKey = await getDb().execute(sql`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);
      const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(String(apiKey.rows[0].prop_value))}&&module=${encodeURIComponent('auction partial')}&&taskId=${encodeURIComponent(ntaskId)}&&email=${encodeURIComponent(String(approverEmail.rows[0].current_assignee))}&&refnumber=${encodeURIComponent(auctionAwardId)}`;
      const orgIdRaw = event?.orgId ?? event?.org_id;
        publishTaskAssignmentEvent({
            taskId: nextTaskId,
            templateEventId: "AUCTION_AWARD_APP",
            taskSub: `Auction award request for ${award.auctionName}`,
            submittedBy: userObj?.name,
            department: userObj?.department || "",
            entityId: event.orgId?.toString(),
            srmsRefNo: award.id?.toString(),
            variables: {
                auctionId: event.id,
                auctionName:award.auctionName,
                orgLogoPath: orgData.org_logo_path,
                domain: sessionUser?.domain,
                emailApprovalLink: approvalLink,
            },
        });

      // Record intermediate approval step in history
      await repo.insertAwardApprovalHistory({
        awardId: String(auctionAwardId),
        approverId: userObj.id,
        approverName: userObj.name,
        approverEmail: (userObj as any).email_id ?? (userObj as any).email ?? null,
        approverDesignation: (userObj as any).designation ?? null,
        status: "Approve",
        comments,
      });
    }

    // =========================================================
    // 🔥 CASE 2: FINAL APPROVAL
    // =========================================================
    if (!nextTaskId && result === "Approved") {
      await auctionEventAwardRepo.update(Number(award.id), {
        status: "Approved",
      });

      let totalAmount: number = Number(event.awardAmount) || 0;
      let awardedAmount: number = Number(event.awardedAmount) || 0;

      const awardList = await auctionEventAwardRepo.findByAuctionId(Number(event.id));

      let approvedCount = 0;
      awardList.forEach((a: any) => {
        if (a.status === "Approved") {
          approvedCount += a.templateAwardRows?.length || 0;
        }
      });

      const updatedEvent = {
        ...event,
        awardAcceptedDate: new Date(),
        awardAccepted: userObj.name,
        approversList: String(userObj.id),
        awardAmount: totalAmount + Number(award.auctionTotal || 0),
        awardedAmount:
          awardedAmount + Number(award.auctionTotal || 0),
        status: "Awarded",
      };

      await repo.update(updatedEvent);

      // need to work 
      // await eventBus.publish({
      //   type: "AWARD_APPROVE",
      //   awardId: Number(auctionAwardId),
      // });

      await updateAuctionOrderActivity(
        Number(event.id),
        "Auction Award Request is Approved",
        loggedInUsername
      );

      // need to work
      // await auditService.log(
      //   auctionAwardId,
      //   "Auction Award Request is Approved",
      //   "Auction",
      //   "APPROVED"
      // );

      logAudit({
        auditKey: String(auctionAwardId),
        auditAction: "APPROVED",
        auditMessage: "Auction Award Request is Approved",
        fullName: userObj?.name || "System",
        userId: userObj?.id || "system",
        module: "AUCTIONS",
      }).catch(
        (err: any) =>
          console.error("[Audit] Failed to log:", err?.message)
      );

      await repo.insertAwardApprovalHistory({
        awardId: String(auctionAwardId),
        approverId: userObj.id,
        approverName: userObj.name,
        approverEmail: (userObj as any).email_id ?? (userObj as any).email ?? null,
        approverDesignation: (userObj as any).designation ?? null,
        status: "Approve",
        comments,
      });
    }

    // =========================================================
    // 🔥 CASE 3: REJECTED
    // =========================================================
    if (result === "Rejected") {
      await auctionEventAwardRepo.update(Number(award.id), {
        status: "Rejected",
        approversList: null,
      });

      await repo.update({
        ...event,
        status: "Pending Awarded",
      });

      // need to work
      // await eventBus.publish({
      //   type: "AWARD_REJECT",
      //   awardId: Number(auctionAwardId),
      // });

      // need to work 
      // await auditService.log(
      //   auctionAwardId,
      //   "Auction Award Request is Rejected",
      //   "Auction",
      //   "REJECTED"
      // );

      logAudit({
        auditKey: String(auctionAwardId),
        auditAction: "REJECTED",
        auditMessage: "Auction Award Request is Rejected",
        fullName: userObj?.name || "System",
        userId: userObj?.id || "system",
        module: "AUCTIONS",
      }).catch(
        (err: any) =>
          console.error("[Audit] Failed to log:", err?.message)
      );

      await updateAuctionOrderActivity(
        Number(event.id),
        "Auction Award Request is Rejected",
        loggedInUsername
      );

      await repo.insertAwardApprovalHistory({
        awardId: String(auctionAwardId),
        approverId: userObj.id,
        approverName: userObj.name,
        approverEmail: (userObj as any).email_id ?? (userObj as any).email ?? null,
        approverDesignation: (userObj as any).designation ?? null,
        status: "Reject",
        comments,
      });
    }

    // =========================================================
    // 🔥 APPROVER LIST CLEANUP
    // =========================================================
    if (result === "Approved") {
      let approverList = String(award.approversList) || "";

      if (approverList.includes(",")) {
        approverList = approverList.replace(`${userObj.emailId},`, "");
      } else {
        approverList = "";
      }

      await auctionEventAwardRepo.update(Number(award.id), {
        approversList: approverList,
      });
    }
    const updatedEvent: any = await repo.getAuctionEventById(Number(award.auction_id));
    // 🔹 Save event again (like your duplicate call)
    await repo.update(updatedEvent);

    // 🔹 Log approver history
    await helperUtils.logApproversHistory(
      wfStepInstances,
      "AWARD",
      auctionAwardId,
      "0",
      userObj,
      comments,
      new Date(),
      result,
      delegatedUser,
      sessionUser
    );

    return "Successfully processed your request.";
  } catch (error) {
    console.error(error);
    return "Error occured while processing your request!";
  }
}

export async function getBidSummaryHistBySupplier(auctionId: number, suppId: number) {
  if (!auctionId) {
    throw new Error("Auction ID is mandatory to get Bid Summary.");
  }

  try {
    const history = await auctionEventResponseHistoryRepo.getAllSuppliersByAuctionId(
      auctionId,
      suppId
    );

    if (!history?.length) return [];

    const hydrated = await Promise.all(
      history.map(async (respHist: any) => {
        const rows = await getDb()
          .select()
          .from(auctionSuppResponseRowHistory)
          .where(eq(auctionSuppResponseRowHistory.auSuppEventRespId, Number(respHist.id)));

        const rowsWithCols = await Promise.all(
          rows.map(async (row) => {
            const cols = await getDb()
              .select()
              .from(auctionSuppResponseColumnValuesHistory)
              .where(
                eq(
                  auctionSuppResponseColumnValuesHistory.auSuppEventRespRowId,
                  Number(row.id)
                )
              );
            return {
              ...row,
              columnResponseValues: cols,
            };
          })
        );

        return {
          ...respHist,
          templateResponseRows: rowsWithCols,
        };
      })
    );

    // Preserve previous grouping/flattening semantics while returning hydrated rows.
    const grouped = hydrated.reduce((acc: Record<string, any[]>, item) => {
      const key = String(item.supplierId ?? "");
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    const historyList: any[] = [];
    for (const key in grouped) {
      historyList.push(...grouped[key]);
    }
    return historyList;
  } catch (e: any) {
    throw new Error("Not able to get the Bid Summary " + e.message);
  }
}

export async function getBidDeleteRequestBySupp(auctionId: number, suppId: number) {
  let msg = "Error";

  if (!auctionId || !suppId) {
    throw new Error(
      "Error: Auction ID and Supplier ID's are not updated from UI."
    );
  }

  try {
    const history =
      await auctionEventResponseHistoryRepo.getLatestRecordDetails(
        auctionId,
        suppId
      );
    const orgData = await adminRepo.getOrgDetails();

    const auEvent = await repo.getAuctionEventById(auctionId);

    if (history && history.length > 0) {
      for (const respHist of history) {
        const id = respHist.id;

        try {
          msg = await auctionEventResponseHistoryRepo.updateSupplierDeleteBidRequest(
            auctionId,
            suppId,
            id
          );
        } catch (e: any) {
          throw new Error(
            "Not able to delete the bid request " + e.message
          );
        }

        console.log(msg);

        // 🔹 Send notification event
        if (msg === "SuccessBitDeleteRequest") {
          const event = {
            email: auEvent?.createdBy,
            auctionNo: respHist.auctionId,
            submittedBy: respHist.supplierName,
            status: "abc",
          };

          // Notify buyer of delete request
          eventBus.publish({
            eventType: EventTypes.BID_DELETE_REQUESTED,
            timestamp: new Date(),
            userName: auEvent?.createdBy || "Buyer",
            auctionId: String(respHist.auctionId),
            vendorName: respHist.supplierName || "Vendor",
            amount: String(respHist.auctionTotal || 0),
            linkUrl: `${process.env.FRONTEND_URL}/auctions/${respHist.auctionId}`,
            receiverEmail: auEvent?.createdBy || "",
            orgLogoPath: orgData.org_logo_path,
          });
        }
      }

      // need to work
      // 🔹 SSE Push
      // const emitter = emitters.get(String(auctionId));

      // if (emitter) {
        try {
          const auctionDetails =
            await getAuctionEventDetailsById(auctionId);

          // emitter.send({
          //   event: "AuctionDetails",
          //   data: JSON.stringify(auctionDetails),
          // });
        } catch (e) {
          console.error(e);
        }
      // }

      return msg;
    } else {
      throw new Error(
        "Error: Auction ID and Supplier ID are mandatory to delete the bid data."
      );
    }
  } catch (e) {
    console.error(e);
    throw e;
  }
}

export async function getBidSummaryPartial(auctionId: number, auctionType: string) {

  if (!auctionId || !auctionType) return null;

  let history: any[] | null = null;
  const historyList: any[] = [];

  try {
    if (auctionType.toLowerCase() === "partial based") {
      const optionalHistory =
        await auctionEventResponseHistoryRepo.findByAuctionId(
          auctionId
        );

      if (optionalHistory && optionalHistory.length > 0) {
        history = optionalHistory;
      }

      if (history) {
        // 🔹 Filter rows (lineItemTotal != 0)
        for (const auction of history) {
          auction.templateResponseRows =
            (auction.templateResponseRows || []).filter(
              (temp: any) =>
                temp.lineItemTotal !== null &&
                Number(temp.lineItemTotal) !== 0
            );
        }

        // 🔹 Group by supplierId
        const grouped: Record<number, any[]> = {};

        for (const item of history) {
          const key = item.supplierId;
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(item);
        }

        // 🔹 Process each supplier group
        for (const supplierId in grouped) {
          const id =
            await auctionEventResponseHistoryRepo.findByAuctionIdSupplierId(
              auctionId,
              Number(supplierId)
            );

          if (id !== null) {
            for (const respHist of grouped[supplierId]) {
              // 🔹 Logic for latestBid
              if (
                respHist.status &&
                respHist.status.toLowerCase() === "deleted"
              ) {
                respHist.latestBid = false;
              } else if (respHist.id === id) {
                respHist.latestBid = true;
              }

              historyList.push(respHist);
            }
          }
        }

        return hydrateBidSummaryItems(historyList);
      }
    }
  } catch (e) {
    console.error(e);
  }

  return null;
}

export async function deleteAuctionEvent(auctionId: number) {
  if (!auctionId) {
    throw new Error("Auction id is required");
  }
  await repo.deleteAuctionEventById(auctionId);
  return { success: true, message: "Auction deleted successfully" };
}

