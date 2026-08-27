import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  integer,
  numeric,
  pgSchema,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// DBO Schema for imported production data
export const dboSchema = pgSchema("dbo");

// ---------------------------------------------------------------------------
// Auction module — dbo tables (see server/db/migrations/auctions_database_updates.sql)
// ---------------------------------------------------------------------------

export const auAuctionOrderActivity = dboSchema.table("au_auction_order_activity", {
  id: serial("id").primaryKey(),

  activity: varchar("activity", { length: 255 }),

  auctionId: bigint("auction_id", { mode: "number" }),

  createdBy: varchar("created_by", { length: 255 }),

  creationTime: timestamp("creation_time", { withTimezone: true }),
});

export type AuAuctionOrderActivity = typeof auAuctionOrderActivity.$inferSelect;

export type InsertAuAuctionOrderActivity = typeof auAuctionOrderActivity.$inferInsert;

export const auAuctionBroadCastMessage = dboSchema.table("au_auction_broadcast_message", {
  id: serial("id").primaryKey(),
  broadCastMessage: varchar("broad_cast_message", { length: 1000 }),
  auctionId: bigint("auction_id", { mode: "number" }),
  createdBy: varchar("created_by", { length: 255 }),
  creationTime: timestamp("creation_time", { withTimezone: true }),
});

export type AuAuctionBroadCastMessage = typeof auAuctionBroadCastMessage.$inferSelect;

export type InsertAuAuctionBroadCastMessage = typeof auAuctionBroadCastMessage.$inferInsert;

export const auctionSuppResponseEvent = dboSchema.table(
  "au_auction_supp_event_response",
  {
    id: serial("id").primaryKey(),

    auctionId: bigint("auction_id", { mode: "number" }),
    supplierId: bigint("supplier_id", { mode: "number" }),

    auctionName: text("auction_name"),
    supplierName: text("supplier_name"),
    supplierContact: text("supplier_contact"),

    siteId: integer("site_id"),
    supplierSite: text("supplier_site"),
    supplierContactNo: text("supplier_contact_no"),
    supplierContactEmail: text("supplier_contact_email"),

    auctionTotal: numeric("auction_total"),
    suppRank: integer("supp_rank"),

    grossTotal: numeric("gross_total"),
    version: text("version"),
    suppComments: text("supp_comments"),

    templateId: bigint("template_id", { mode: "number" }),
    auctionType: text("auction_type"),
    orgId: integer("orgid"),

    auctionStrategy: text("auction_strategy"),
    auctionDuration: integer("auction_duration"),
    auctionDurationUnits: text("auction_duration_units"),

    isScheduledEvent: text("is_scheduled_event"),

    startTime: timestamp("start_time"),
    endTime: timestamp("end_time"),
    deliveryDate: timestamp("delivery_date"),

    allotmentType: text("allotment_type"),

    ifBidInLastMinutesInMins: integer("if_bid_in_last_minutes_in_mins"),
    acutiontTimeExtensionInMins: integer("acution_time_extension_in_mins"),

    auctionSavingMeasure: text("auction_saving_measure"),
    auctionSavingReference: text("auction_saving_reference"),
    auctionSavingReferenceValue: text("auction_saving_reference_value"),

    currency: text("currency"),
    status: text("status"),

    bidTime: timestamp("bid_time"),
    creationTime: timestamp("creation_time"),
    lastModificationTime: timestamp("last_modification_time"),

    createdBy: text("created_by"),
    lastModifiedBy: text("last_modified_by"),

    attribute1: integer("attribute1").default(0),
    attribute2: text("attribute2"),
    attribute3: text("attribute3"),
    attribute4: text("attribute4"),
    attribute5: text("attribute5"),
    attribute6: text("attribute6"),
    attribute7: text("attribute7"),
    attribute8: text("attribute8"),
    attribute9: text("attribute9"),
    attribute10: text("attribute10"),
    attribute11: text("attribute11"),
    attribute12: text("attribute12"),
    attribute13: text("attribute13"),
    attribute14: text("attribute14"),
    attribute15: text("attribute15"),

    suppRespDocsMapping: text("supp_resp_docs_mapping"),
    placeProxy: text("place_proxy"),

    isBasket: text("is_basket"),
    basketAuctionDuration: integer("basket_auction_duration"),
  },
);

export type AuAuctionSuppResponseEvent = typeof auctionSuppResponseEvent.$inferSelect;

export type InsertAuAuctionSuppResponseEvent = typeof auctionSuppResponseEvent.$inferInsert;

export const auctionSuppResponseRow = dboSchema.table("au_auction_supp_event_response_row", {
  id: serial("id").primaryKey(),

  templateId: text("template_id"),

  auctionSuppRespId: integer("au_supp_event_resp_id").notNull(),

  auRowId: bigint("au_row_id", { mode: "number" }),

  lineItemTotal: numeric("line_item_total"),
  lineItemBasePrice: numeric("line_item_base_price"),

  buyerDocsMapping: text("buyer_docs_mapping"),
  suppDocsMapping: text("supp_docs_mapping"),

  createdBy: text("created_by"),
  creationTime: timestamp("creation_time"),
  lastModificationTime: timestamp("last_modification_time"),
  lastModifiedBy: text("last_modified_by"),

  suppProductRank: integer("supp_product_rank"),
  savingsAmount: numeric("savings_amount"),

  basketAuctionStatus: text("basket_auction_status"),
});

export type AuAuctionSuppResponseRow = typeof auctionSuppResponseRow.$inferSelect;

export type InsertAuAuctionSuppResponseRow = typeof auctionSuppResponseRow.$inferInsert;

export const auctionSuppResponseAttachment = dboSchema.table(
  "au_auction_supp_event_response_attachment_mapping",
  {
    id: serial("id").primaryKey(),

    creationTime: timestamp("creation_time"),
    lastModificationTime: timestamp("last_modification_time"),

    createdBy: text("created_by"),
    lastModifiedBy: text("last_modified_by"),

    attribute1: text("attribute1"),
    attribute2: text("attribute2"),
    attribute3: text("attribute3"),
    attribute4: text("attribute4"),

    attachDesc: text("attach_desc"),
    attachName: text("attach_name"),
    attachPath: text("attach_path"),
    attachSource: text("attach_source"),
    attachType: text("attach_type"),

    status: text("status"),
    supplierId: integer("supplier_id"),

    docThumbnail: text("doc_thumbnail"),

    auctionSuppRespId: integer("auction_supp_resp_id").notNull(),
  },
);

export const auctionEventSuppMapping = dboSchema.table("au_auction_event_supp_mapping", {
  id: serial("id").primaryKey(),

  creationTime: timestamp("creation_time"),
  lastModificationTime: timestamp("last_modification_time"),

  createdBy: text("created_by"),
  lastModifiedBy: text("last_modified_by"),

  attribute1: text("attribute1"),
  attribute2: text("attribute2"),
  attribute3: text("attribute3"),
  attribute4: text("attribute4"),
  attribute5: text("attribute5"),
  attribute6: text("attribute6"),
  attribute7: text("attribute7"),
  attribute8: text("attribute8"),
  attribute9: text("attribute9"),
  attribute10: text("attribute10"),
  attribute11: text("attribute11"),
  attribute12: text("attribute12"),
  attribute13: text("attribute13"),
  attribute14: text("attribute14"),
  attribute15: text("attribute15"),

  eventId: integer("eventid").notNull(),

  suppId: integer("supp_id"),

  seenBy: text("seen_by"),
  seen: boolean("seen").default(false),
  sent: boolean("sent").default(false),

  seenDateTime: timestamp("seen_date_time"),
});

export type AuctionEventSuppMapping = typeof auctionEventSuppMapping.$inferSelect;

export type InsertAuctionEventSuppMapping = typeof auctionEventSuppMapping.$inferInsert;

export type AuAuctionSuppResponseAttachment = typeof auctionSuppResponseAttachment.$inferSelect;

export type InsertAuAuctionSuppResponseAttachment = typeof auctionSuppResponseAttachment.$inferInsert;

export const auctionEventTemplateRowMapping = dboSchema.table(
  "au_auction_event_template_row_mapping",
  {
    id: serial("id").primaryKey(),

    creationTime: timestamp("creation_time"),
    lastModificationTime: timestamp("last_modification_time"),

    createdBy: text("created_by"),
    lastModifiedBy: text("last_modified_by"),

    eventId: integer("eventid").notNull(),

    templateId: bigint("template_id", { mode: "number" }),

    savingsAmount: numeric("savings_amount"),

    suppDocsMapping: text("supp_docs_mapping"),
    buyerDocsMapping: text("buyer_docs_mapping"),

    attribute1: text("attribute1"),
    attribute2: text("attribute2"),
    attribute3: text("attribute3"),
    attribute4: text("attribute4"),
    attribute5: text("attribute5"),
    attribute6: text("attribute6"),
    attribute7: text("attribute7"),
    attribute8: text("attribute8"),
    attribute9: text("attribute9"),
    attribute10: text("attribute10"),
    attribute11: text("attribute11"),
    attribute12: text("attribute12"),
    attribute13: text("attribute13"),
    attribute14: text("attribute14"),
    attribute15: text("attribute15"),

    basketAuctionStatus: text("basket_auction_status"),

    startTime: timestamp("start_time"),
    endTime: timestamp("end_time"),
  },
);

export type AuctionEventTemplateRowMapping = typeof auctionEventTemplateRowMapping.$inferSelect;

export type InsertAuctionEventTemplateRowMapping = typeof auctionEventTemplateRowMapping.$inferInsert;

export const auctionEvent = dboSchema.table("au_auction_event", {
  id: serial("id").primaryKey(),

  creationTime: timestamp("creation_time"),
  lastModificationTime: timestamp("last_modification_time"),

  createdBy: text("created_by"),
  lastModifiedBy: text("last_modified_by"),

  attribute1: text("attribute1"),
  attribute2: text("attribute2"),
  attribute3: text("attribute3"),
  attribute4: text("attribute4"),
  attribute5: text("attribute5"),
  attribute6: text("attribute6"),
  attribute7: text("attribute7"),
  attribute8: text("attribute8"),
  attribute9: text("attribute9"),
  attribute10: text("attribute10"),
  attribute11: text("attribute11"),
  attribute12: text("attribute12"),
  attribute13: text("attribute13"),
  attribute14: text("attribute14"),
  attribute15: text("attribute15"),

  name: text("name"),

  templateId: bigint("template_id", { mode: "number" }),
  auctionType: text("auction_type"),
  orgId: integer("orgid"),

  auctionStrategy: text("auction_strategy"),
  auctionDuration: integer("auction_duration"),
  auctionDurationUnits: text("auction_duration_units"),

  isScheduledEvent: text("is_scheduled_event"),

  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  deliveryDate: timestamp("delivery_date"),

  allotmentType: text("allotment_type"),

  ifBidInLastMinutesInMins: integer("if_bid_in_last_minutes_in_mins"),
  acutiontTimeExtensionInMins: integer("acution_time_extension_in_mins"),

  ifBidInLastMinutesInMinsUnits: text("if_bid_in_last_minutes_in_mins_units"),
  acutiontTimeExtensionInMinsUnits: text("acution_time_extension_in_mins_units"),

  auctionSavingMeasure: text("auction_saving_measure"),
  auctionSavingReference: text("auction_saving_reference"),
  auctionSavingReferenceValue: text("auction_saving_reference_value"),

  currency: text("currency"),
  status: text("status"),

  statusTime: date("status_time"),

  isAuctionWithdraw: boolean("isauctionwithdraw").default(false),
  auctionWithdrawReason: text("auctionwithdrawreason"),

  broadCastMessage: text("broad_cast_message"),

  supplierRespCount: integer("supplier_resp_count"),
  noOfBids: integer("bids_count").default(0),

  awardAccepted: text("award_accepted"),
  awardAcceptedDate: timestamp("award_accepted_date"),

  approversList: text("approvers_list"),

  cancelReason: text("cancel_reason"),

  awardAmount: numeric("award_amount"),
  awardedAmount: numeric("awarded_amount"),

  prNumber: text("pr_number"),

  isBasket: text("is_basket"),
  basketAuctionDuration: integer("basket_auction_duration"),
});

export type AuctionEvent = typeof auctionEvent.$inferSelect;

export type InsertAuctionEvent = typeof auctionEvent.$inferInsert;

export const auctionEventTemplateColumnValues = dboSchema.table(
  "au_auction_event_template_column_values",
  {
    id: serial("id").primaryKey(),

    creationTime: timestamp("creation_time"),
    lastModificationTime: timestamp("last_modification_time"),

    createdBy: text("created_by"),
    lastModifiedBy: text("last_modified_by"),

    attribute1: text("attribute1"),
    attribute2: text("attribute2"),
    attribute3: text("attribute3"),
    attribute4: text("attribute4"),
    attribute5: text("attribute5"),
    attribute6: text("attribute6"),
    attribute7: text("attribute7"),
    attribute8: text("attribute8"),
    attribute9: text("attribute9"),
    attribute10: text("attribute10"),
    attribute11: text("attribute11"),
    attribute12: text("attribute12"),
    attribute13: text("attribute13"),
    attribute14: text("attribute14"),
    attribute15: text("attribute15"),

    rowId: integer("row_id").notNull(),

    columnId: text("column_id"),
    columnValue: text("column_value"),
  },
);

export type AuctionEventTemplateColumnValues = typeof auctionEventTemplateColumnValues.$inferSelect;

export type InsertAuctionEventTemplateColumnValues = typeof auctionEventTemplateColumnValues.$inferInsert;

export const auctionEventTemplate = dboSchema.table("au_auction_event_template", {
  id: serial("id").primaryKey(),

  name: text("name"),

  creationTime: timestamp("creation_time"),
  lastModificationTime: timestamp("last_modification_time"),

  createdBy: text("created_by"),
  lastModifiedBy: text("last_modified_by"),

  attribute1: text("attribute1"),
  attribute2: text("attribute2"),
  attribute3: text("attribute3"),
  attribute4: text("attribute4"),
  attribute5: text("attribute5"),
  attribute6: text("attribute6"),
  attribute7: text("attribute7"),
  attribute8: text("attribute8"),
  attribute9: text("attribute9"),
  attribute10: text("attribute10"),
  attribute11: text("attribute11"),
  attribute12: text("attribute12"),
  attribute13: text("attribute13"),
  attribute14: text("attribute14"),
  attribute15: text("attribute15"),
});

export type AuctionEventTemplate = typeof auctionEventTemplate.$inferSelect;

export type InsertAuctionEventTemplate = typeof auctionEventTemplate.$inferInsert;

export const auctionEventSuppWiseCap = dboSchema.table("au_auction_event_supp_wise_cap", {
  id: serial("id").primaryKey(),
  creationTime: timestamp("creation_time"),
  lastModificationTime: timestamp("last_modification_time"),
  createdBy: text("created_by"),
  lastModifiedBy: text("last_modified_by"),
  suppId: integer("supp_id"),
  supplierName: text("supplier_name"),
  price: numeric("price", { precision: 10, scale: 2 }),
  rowId: integer("row_id").notNull(),
});

export type AuAuctionEventSuppWiseCap = typeof auctionEventSuppWiseCap.$inferSelect;

export type InsertAuctionEventSuppWiseCap = typeof auctionEventSuppWiseCap.$inferInsert;

export const auctionEventTnCMapping = dboSchema.table("au_auction_event_tnc_mapping", {
  id: serial("id").primaryKey(),

  creationTime: timestamp("creation_time"),
  lastModificationTime: timestamp("last_modification_time"),

  createdBy: text("created_by"),
  lastModifiedBy: text("last_modified_by"),

  attribute1: varchar("attribute1", { length: 50 }),
  attribute2: varchar("attribute2", { length: 50 }),
  attribute3: varchar("attribute3", { length: 50 }),
  attribute4: varchar("attribute4", { length: 50 }),
  attribute5: varchar("attribute5", { length: 50 }),
  attribute6: varchar("attribute6", { length: 50 }),
  attribute7: varchar("attribute7", { length: 50 }),
  attribute8: varchar("attribute8", { length: 50 }),
  attribute9: varchar("attribute9", { length: 50 }),
  attribute10: varchar("attribute10", { length: 50 }),
  attribute11: varchar("attribute11", { length: 50 }),
  attribute12: varchar("attribute12", { length: 50 }),
  attribute13: varchar("attribute13", { length: 50 }),
  attribute14: varchar("attribute14", { length: 50 }),
  attribute15: varchar("attribute15", { length: 50 }),

  eventId: integer("eventid").notNull(),
  tncId: bigint("tnc_id", { mode: "number" }),
});

export type AuctionEventTnCMapping = typeof auctionEventTnCMapping.$inferSelect;

export type InsertAuctionEventTnCMapping = typeof auctionEventTnCMapping.$inferInsert;

export const auctionSuppAwardEvent = dboSchema.table("au_auction_supp_award_event", {
  id: serial("id").primaryKey(),

  auctionId: integer("auction_id"),
  supplierId: integer("supplier_id"),

  auctionName: text("auction_name"),
  supplierName: text("supplier_name"),
  supplierContact: text("supplier_contact"),

  siteId: integer("site_id"),
  supplierSite: text("supplier_site"),
  supplierContactNo: text("supplier_contact_no"),
  supplierContactEmail: text("supplier_contact_email"),

  auctionTotal: numeric("auction_total"),
  suppRank: integer("supp_rank"),
  grossTotal: numeric("gross_total"),

  version: text("version"),
  suppComments: text("supp_comments"),

  templateId: integer("template_id"),
  auctionType: text("auction_type"),
  orgId: integer("orgid"),

  auctionStrategy: text("auction_strategy"),
  auctionDuration: integer("auction_duration"),
  auctionDurationUnits: text("auction_duration_units"),

  isScheduledEvent: text("is_scheduled_event"),

  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),

  allotmentType: text("allotment_type"),
  deliveryDate: timestamp("delivery_date"),

  ifBidInLastMinutesInMins: integer("if_bid_in_last_minutes_in_mins"),
  acutiontTimeExtensionInMins: integer("acution_time_extension_in_mins"),

  auctionSavingMeasure: text("auction_saving_measure"),
  auctionSavingReference: text("auction_saving_reference"),
  auctionSavingReferenceValue: text("auction_saving_reference_value"),

  awardDate: timestamp("award_date"),
  awardComments: text("award_comments"),
  approversList: text("approvers_list"),

  currency: text("currency"),
  status: text("status"),

  bidTime: timestamp("bid_time"),

  suppRespDocsMapping: text("supp_resp_docs_mapping"),
  placeProxy: text("place_proxy"),

  auctionSuppRespNo: integer("auction_supp_resp_no"),
  notes: text("notes"),

  creationTime: timestamp("creation_time"),
  lastModificationTime: timestamp("last_modification_time"),

  createdBy: text("created_by"),
  lastModifiedBy: text("last_modified_by"),

  attribute1: text("attribute1"),
  attribute2: text("attribute2"),
  attribute3: text("attribute3"),
  attribute4: text("attribute4"),
  attribute5: text("attribute5"),
  attribute6: text("attribute6"),
  attribute7: text("attribute7"),
  attribute8: text("attribute8"),
  attribute9: text("attribute9"),
  attribute10: text("attribute10"),
  attribute11: text("attribute11"),
  attribute12: text("attribute12"),
  attribute13: text("attribute13"),
  attribute14: text("attribute14"),
  attribute15: text("attribute15"),
});

export type AuctionSuppAwardEvent = typeof auctionSuppAwardEvent.$inferSelect;

export type InsertAuctionSuppAwardEvent = typeof auctionSuppAwardEvent.$inferInsert;

export const auctionSuppAwardEventRow = dboSchema.table("au_auction_supp_award_event_row", {
  id: serial("id").primaryKey(),

  templateId: text("template_id"),

  auctionSuppAwardEventId: integer("au_supp_event_award_id").notNull(),

  attribute1: text("attribute1"),
  attribute2: text("attribute2"),
  attribute3: text("attribute3"),
  attribute4: text("attribute4"),
  attribute5: text("attribute5"),
  attribute6: text("attribute6"),
  attribute7: text("attribute7"),
  attribute8: text("attribute8"),
  attribute10: text("attribute10"),
  attribute11: text("attribute11"),
  attribute12: text("attribute12"),
  attribute13: text("attribute13"),
  attribute14: text("attribute14"),
  attribute15: text("attribute15"),

  auRowId: integer("au_row_id"),

  lineItemTotal: numeric("line_item_total"),
  lineItemBasePrice: numeric("line_item_base_price"),

  buyerDocsMapping: text("buyer_docs_mapping"),
  suppDocsMapping: text("supp_docs_mapping"),

  createdBy: text("created_by"),
  creationTime: timestamp("creation_time"),

  lastModificationTime: timestamp("last_modification_time"),
  lastModifiedBy: text("last_modified_by"),
});

export type AuctionSuppAwardEventRow = typeof auctionSuppAwardEventRow.$inferSelect;

export type InsertAuctionSuppAwardEventRow = typeof auctionSuppAwardEventRow.$inferInsert;

export const auctionSuppAwardEventTemplateColumnValues = dboSchema.table(
  "au_auction_supp_award_event_template_column_values",
  {
    id: serial("id").primaryKey(),
    columnId: text("column_id"),
    columnKey: text("column_key"),
    columnValue: text("column_value"),
    suppRspColumnValue: text("supp_rsp_column_value"),
    auSuppEventAwardRowId: integer("au_supp_event_award_row_id").notNull(),
    createdBy: text("created_by"),
    creationTime: timestamp("creation_time"),
    lastModificationTime: timestamp("last_modification_time"),
    lastModifiedBy: text("last_modified_by"),
  },
);

export type AuctionSuppAwardEventTemplateColumnValues =
  typeof auctionSuppAwardEventTemplateColumnValues.$inferSelect;
export type InsertAuctionSuppAwardEventTemplateColumnValues =
  typeof auctionSuppAwardEventTemplateColumnValues.$inferInsert;

export const auctionSuppEventResponseTemplateColumnValues = dboSchema.table(
  "au_auction_supp_event_response_template_column_values",
  {
    id: serial("id").primaryKey(),
    columnId: text("column_id"),
    columnKey: text("column_key"),
    columnValue: text("column_value"),
    suppRspColumnValue: text("supp_rsp_column_value"),
    auctionSuppRespRowId: integer("au_supp_event_resp_row_id").notNull(),
    createdBy: text("created_by"),
    creationTime: timestamp("creation_time"),
    lastModificationTime: timestamp("last_modification_time"),
    lastModifiedBy: text("last_modified_by"),
  },
);

export type AuctionSuppEventResponseTemplateColumnValues =
  typeof auctionSuppEventResponseTemplateColumnValues.$inferSelect;
export type InsertAuctionSuppEventResponseTemplateColumnValues =
  typeof auctionSuppEventResponseTemplateColumnValues.$inferInsert;

export const auctionSuppResponseEventHistory = dboSchema.table(
  "au_auction_supp_event_response_history",
  {
    id: serial("id").primaryKey(),

    auctionId: integer("auction_id"),
    supplierId: integer("supplier_id"),

    auctionName: text("auction_name"),
    supplierName: text("supplier_name"),
    supplierContact: text("supplier_contact"),

    siteId: integer("site_id"),
    supplierSite: text("supplier_site"),
    supplierContactNo: text("supplier_contact_no"),
    supplierContactEmail: text("supplier_contact_email"),

    auctionTotal: numeric("auction_total"),
    suppRank: integer("supp_rank"),
    grossTotal: numeric("gross_total"),

    version: text("version"),
    suppComments: text("supp_comments"),

    templateId: integer("template_id"),
    auctionType: text("auction_type"),
    orgId: integer("orgid"),

    auctionStrategy: text("auction_strategy"),
    auctionDuration: integer("auction_duration"),
    auctionDurationUnits: text("auction_duration_units"),

    isScheduledEvent: text("is_scheduled_event"),

    startTime: timestamp("start_time"),
    endTime: timestamp("end_time"),

    allotmentType: text("allotment_type"),
    deliveryDate: timestamp("delivery_date"),

    ifBidInLastMinutesInMins: integer("if_bid_in_last_minutes_in_mins"),
    acutiontTimeExtensionInMins: integer("acution_time_extension_in_mins"),

    auctionSavingMeasure: text("auction_saving_measure"),
    auctionSavingReference: text("auction_saving_reference"),
    auctionSavingReferenceValue: text("auction_saving_reference_value"),

    currency: text("currency"),
    status: text("status"),

    bidTime: timestamp("bid_time"),

    creationTime: timestamp("creation_time"),
    lastModificationTime: timestamp("last_modification_time"),

    createdBy: text("created_by"),
    lastModifiedBy: text("last_modified_by"),

    attribute1: text("attribute1"),
    attribute2: text("attribute2"),
    attribute3: text("attribute3"),
    attribute4: text("attribute4"),
    attribute5: text("attribute5"),
    attribute6: text("attribute6"),
    attribute7: text("attribute7"),
    attribute8: text("attribute8"),
    attribute9: text("attribute9"),
    attribute10: text("attribute10"),
    attribute11: text("attribute11"),
    attribute12: text("attribute12"),
    attribute13: text("attribute13"),
    attribute14: text("attribute14"),
    attribute15: text("attribute15"),

    placeProxy: text("place_proxy"),
    isBasket: text("is_basket"),
    basketAuctionDuration: integer("basket_auction_duration"),
  },
);

export type AuctionSuppResponseEventHistory = typeof auctionSuppResponseEventHistory.$inferSelect;

export type InsertAuctionSuppResponseEventHistory = typeof auctionSuppResponseEventHistory.$inferInsert;

export const auctionSuppResponseRowHistory = dboSchema.table(
  "au_auction_supp_event_response_row_history",
  {
    id: serial("id").primaryKey(),

    templateId: varchar("template_id", { length: 255 }),

    auSuppEventRespId: integer("au_supp_event_resp_id").notNull(),

    auRowId: bigint("au_row_id", { mode: "number" }),

    lineItemTotal: numeric("line_item_total", { precision: 18, scale: 2 }),

    lineItemBasePrice: numeric("line_item_base_price", {
      precision: 18,
      scale: 2,
    }),

    buyerDocsMapping: text("buyer_docs_mapping"),
    suppDocsMapping: text("supp_docs_mapping"),

    createdBy: varchar("created_by", { length: 255 }),
    creationTime: timestamp("creation_time"),

    lastModificationTime: timestamp("last_modification_time"),
    lastModifiedBy: varchar("last_modified_by", { length: 255 }),

    suppProductRank: integer("supp_product_rank"),

    savingsAmount: numeric("savings_amount", {
      precision: 18,
      scale: 2,
    }),

    basketAuctionStatus: varchar("basket_auction_status", {
      length: 50,
    }),
  },
);

export type AuctionSuppResponseRowHistory = typeof auctionSuppResponseRowHistory.$inferSelect;
export type InsertAuctionSuppResponseRowHistory = typeof auctionSuppResponseRowHistory.$inferInsert;

export const auctionSuppResponseColumnValuesHistory = dboSchema.table(
  "au_auction_supp_event_response_template_column_values_history",
  {
    id: serial("id").primaryKey(),

    auSuppEventRespRowId: integer("au_supp_event_resp_row_id").notNull(),

    columnId: varchar("column_id", { length: 255 }),
    columnValue: text("column_value"),
    columnKey: varchar("column_key", { length: 255 }),
    suppRspColumnValue: text("supp_rsp_column_value"),

    createdBy: varchar("created_by", { length: 255 }),
    creationTime: timestamp("creation_time"),

    lastModificationTime: timestamp("last_modification_time"),
    lastModifiedBy: varchar("last_modified_by", { length: 255 }),
  },
);

export type AuctionSuppResponseColumnValuesHistory =
  typeof auctionSuppResponseColumnValuesHistory.$inferSelect;

// PR Status values from production data
export const suppPrStatuses = ["Draft", "Approved", "Pending Approval", "Complete", "More Info Required", "Cancelled", "Rejected"] as const;
export type SuppPrStatus = typeof suppPrStatuses[number];

// Production PR Header table (from dbo schema)
export const suppPrHeaderDtls = dboSchema.table("supp_pr_header_dtls", {
  prNumber: varchar("pr_number").primaryKey(),
  prDescription: varchar("pr_description"),
  prStatus: varchar("pr_status"),
  prType: varchar("pr_type"),
  prAmount: numeric("pr_amount"),
  currency: varchar("currency"),
  departmentName: varchar("department_name"),
  requestorId: integer("requestor_id"),
  requestorName: varchar("requestor_name"),
  requestorEmail: varchar("requestor_email"),
  prOwnerId: integer("pr_owner_id"),
  prOwnerName: varchar("pr_owner_name"),
  prOwnerEmail: varchar("pr_owner_email"),
  prCreatedDate: timestamp("pr_created_date", { withTimezone: true }),
  approvedDate: timestamp("approved_date", { withTimezone: true }),
  deliverttoLocationId: integer("delivertto_location_id"),
  deliverttoLocationName: varchar("delivertto_location_name"),
  deliveryDate: timestamp("delivery_date", { withTimezone: true }),
  operatingUnit: integer("operating_unit"),
  isContractRequired: varchar("is_contract_required"),
  closedCode: varchar("closed_code"),
  poNumber: varchar("po_number"),
  notes: varchar("notes"),
  notesToApprover: varchar("notes_to_approver"),
  budgetName: varchar("budget_name"),
  budgetSegment: varchar("budget_segment"),
  budgeted: boolean("budgeted"),
  estimatedCost: numeric("estimated_cost"),
  billtoAddress: varchar("billto_address"),
  shiptoAddress: varchar("shipto_address"),
  approversList: varchar("approvers_list"),
  bidno: integer("bidno"),
  bidAwardId: varchar("bid_award_id"),
  orgId: integer("org_id"),
  externalPrNo: varchar("external_pr_no"),
  businessJustification: varchar("business_justification"),
  businessJustificationReason: varchar("business_justification_reason"),
  businessJustificationDetails: varchar("business_justification_details"),
  dynamicsStatus: varchar("dynamics_status"),
  siteId: varchar("site_id"),
  accountingDate: timestamp("accounting_date"),
  createdBy: varchar("created_by"),
  creationDate: timestamp("creation_date", { withTimezone: true }),
  lastModifiedBy: varchar("last_modified_by"),
  lastModifiedDate: timestamp("last_modified_date", { withTimezone: true }),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  ipAddress: varchar("ip_address"),
  objectVersionNumber: integer("object_version_number"),
});

export type SuppPrHeader = typeof suppPrHeaderDtls.$inferSelect;

// Production PR Line table (from dbo schema)
export const suppPrLineDtls = dboSchema.table("supp_pr_line_dtls", {
  id: integer("id").primaryKey(),
  prNumber: varchar("pr_number"),
  lineNum: integer("line_num"),
  lineType: varchar("line_type"),
  itemDescription: varchar("item_description"),
  uom: varchar("uom"),
  unitCost: numeric("unit_cost"),
  qty: numeric("qty"),
  amount: numeric("amount"),
  status: varchar("status"),
  needByDate: timestamp("need_by_date", { withTimezone: true }),
  productCategory: integer("product_category"),
  productCategoryName: varchar("product_category_name"),
  itemId: integer("item_id"),
  buyerId: integer("buyer_id"),
  buyer: varchar("buyer"),
  requestorId: integer("requestor_id"),
  requestor: varchar("requestor"),
  supplierName: varchar("supplier_name"),
  currCode: varchar("curr_code"),
  rfqRequired: varchar("rfq_required"),
  deliverToLocationId: integer("deliver_to_location_id"),
  shiptoaddress: varchar("shiptoaddress"),
  deliveredQty: numeric("delivered_qty"),
  recievedQty: numeric("recieved_qty"),
  cancelledQty: numeric("cancelled_qty"),
  reqLineId: varchar("req_line_id"),
  poNumber: varchar("po_number"),
  lastPurchaseDate: timestamp("last_purchase_date", { withTimezone: true }),
  lastPurchaseRate: numeric("last_purchase_rate"),
  nonRecoverableTax: numeric("non_recoverable_tax"),
  recoverableTax: numeric("recoverable_tax"),
  recoveryRate: numeric("recovery_rate"),
  taxRecoveryOverrideFlag: varchar("tax_recovery_override_flag"),
  discount: doublePrecision("discount"),
  discountPercentage: doublePrecision("discount_percentage"),
  createdBy: varchar("created_by"),
  creationDate: timestamp("creation_date", { withTimezone: true }),
  lastModifiedBy: varchar("last_modified_by"),
  lastModifiedDate: timestamp("last_modified_date", { withTimezone: true }),
  ipAddress: varchar("ip_address"),
  objectVersionNumber: integer("object_version_number"),
});

export type SuppPrLine = typeof suppPrLineDtls.$inferSelect;

// ---------------------------------------------------------------------------
// FMPI — Fair Market Price Intelligence: 100% stateless price benchmark
// snapshots, computed on-demand in memory for maximum real-world accuracy.
export interface FmpSnapshot {
  id?: string | number;
  itemId?: string | null;
  itemName?: string | null;
  productCategory?: number | null;
  productCategoryName?: string | null;
  currCode?: string | null;
  deliveryLocation?: string | null;
  quantity?: number | null;
  fairMarketPrice?: number | null;
  rangeMin?: number | null;
  rangeMax?: number | null;
  totalFairMarketPrice?: number | null;
  totalRangeMin?: number | null;
  totalRangeMax?: number | null;
  confidenceScore?: number;
  priceTrendDirection?: "Rising" | "Falling" | "Stable" | string | null;
  priceTrendMagnitudePct?: number | null;
  lastPurchasePrice?: number | null;
  lastPurchaseDate?: string | null;
  avgOrgPurchasePrice?: number | null;
  approvedPoSampleSize?: number | null;
  prHistoryAvgPrice?: number | null;
  prHistorySampleSize?: number | null;
  supplierQuotationAvgPrice?: number | null;
  supplierQuotationSampleSize?: number | null;
  marketTrendPrice?: number | null;
  marketTrendCurrency?: string | null;
  marketTrendSampleSize?: number | null;
  regionalMarketPrice?: number | null;
  regionalMarketScope?: string | null;
  sourcesUsedCount?: number;
  sourcesUsedList?: string | null;
  sourcesUsed?: string[];
  sourcesNA?: string[];
  reasoning?: string | null;
  calculatedDate?: string | Date | null;
  calculatedBy?: string | null;
  recalcReason?: string | null;
}

// Production Categories table (from dbo schema - UNSPSC hierarchy)
export const dboPmCatCategories = dboSchema.table("pm_cat_categories", {
  id: varchar("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  level: varchar("level", { length: 50 }).notNull().default("commodity"),
  parentCode: varchar("parent_code", { length: 50 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type DboPmCatCategory = typeof dboPmCatCategories.$inferSelect;


// Production Categories table (from dbo schema - UNSPSC hierarchy)
export const dboCatCategories = dboSchema.table("cat_categories", {
  category_id: integer("category_id").primaryKey(),
  categoryName: varchar("category_name", { length: 200 }),
  description: varchar("description", { length: 500 }),
  status: varchar("status", { length: 20 }),
  parentCategoryId: integer("parent_category_id"),
  catType: varchar("cat_type"),
  extEntityRef: varchar("ext_entity_ref"),
  createdBy: varchar("created_by", { length: 50 }),
  creationDate: timestamp("creation_date", { withTimezone: true }),
  lastModifiedBy: varchar("last_modified_by", { length: 50 }),
  lastModifiedDate: timestamp("last_modified_date", { withTimezone: true }),
  parentCategoryName: varchar("parent_category_name", { length: 200 }),
  prodCategoryId: varchar("prod_category_id", { length: 50 }),
});


export type dboCatCategories = typeof dboCatCategories.$inferSelect;

// Production Product Master table (from dbo schema)
export const dboProductMaster = dboSchema.table("pm_product_master", {
  id: varchar("id", { length: 10 }).primaryKey(),
  skuNo: varchar("sku_no", { length: 255 }),
  productName: varchar("product_name", { length: 255 }),
  productShortDesc: varchar("product_short_desc", { length: 500 }),
  productLongDesc: varchar("product_long_desc", { length: 2000 }),
  productSpecification: varchar("product_specification", { length: 2000 }),
  productCategory: integer("product_category"),
  productSubcategory: integer("product_subcategory"),
  productHsn: varchar("product_hsn", { length: 50 }),
  productImage: text("product_image"),
  lastPurchaseRate: numeric("last_purchase_rate"),
  lastPurchaseDate: timestamp("last_purchase_date", { withTimezone: true }),
  supplierName: varchar("supplier_name", { length: 255 }),
  unitOfMeasure: varchar("unit_of_measure", { length: 50 }).default("EA"),
  currency: varchar("currency", { length: 10 }).default("INR"),
  manufacturerPartNumber: varchar("manufacturer_part_number", { length: 255 }),
  leadTimeDays: integer("lead_time_days"),
  minOrderQuantity: integer("min_order_quantity").default(1),
  status: varchar("status", { length: 50 }).default("active"),
  isActive: boolean("is_active").default(true),
  attribute1: varchar("attribute1", { length: 255 }),
  attribute2: varchar("attribute2", { length: 255 }),
  attribute3: varchar("attribute3", { length: 255 }),
  attribute4: varchar("attribute4", { length: 255 }),
  attribute5: varchar("attribute5", { length: 255 }),
  attribute6: varchar("attribute6", { length: 255 }),
  attribute7: varchar("attribute7", { length: 255 }),
  attribute8: varchar("attribute8", { length: 255 }),
  attribute9: varchar("attribute9", { length: 255 }),
  attribute10: varchar("attribute10", { length: 255 }),
  attribute11: varchar("attribute11", { length: 255 }),
  attribute12: varchar("attribute12", { length: 255 }),
  attribute13: varchar("attribute13", { length: 255 }),
  attribute14: varchar("attribute14", { length: 255 }),
  attribute15: varchar("attribute15", { length: 255 }),
  taxRate: numeric("tax_rate"),
  taxCode: varchar("tax_code", { length: 255 }),
  taxCodeId: varchar("tax_code_id", { length: 255 }),
  createdBy: varchar("created_by", { length: 255 }),
  creationTime: timestamp("creation_time", { withTimezone: true }),
  lastModifiedBy: varchar("last_modified_by", { length: 255 }),
  lastModifiedDate: timestamp("last_modified_date", { withTimezone: true }),
});

export type DboProductMaster = typeof dboProductMaster.$inferSelect;
export type InsertDboProductMaster = typeof dboProductMaster.$inferInsert;

// DBO Vendor/Supplier table (supp_basic_org_dtls)
export const dboVendorStatuses = ["Active", "Draft", "Pending Approval", "Rejected", "InActive"] as const;
export type DboVendorStatus = typeof dboVendorStatuses[number];

export const dboSuppliers = dboSchema.table("supp_basic_org_dtls", {
  id: integer("id").primaryKey(),
  attribute5: varchar("attribute_5", { length: 255 }),
  attribute12: varchar("attribute_12", { length: 255 }),
  attribute4: varchar("attribute_4", { length: 50 }),
  companyName: varchar("company_name", { length: 500 }),
  prevStatus: varchar("prev_status", { length: 50 }),
  status: varchar("status", { length: 50 }),
  country: varchar("country", { length: 100 }),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 100 }),
  address1: varchar("address_1", { length: 500 }),
  address2: varchar("address_2", { length: 500 }),
  postalcode: varchar("postalcode", { length: 20 }),
  emailId: varchar("email_id", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  phoneAreaCode: varchar("phone_area_code", { length: 10 }),
  phoneCtryCode: varchar("phone_ctry_code", { length: 10 }),
  fax: varchar("fax", { length: 50 }),
  webAddress: varchar("web_address", { length: 255 }),
  vendorCategory: varchar("vendor_category", { length: 100 }),
  supplierType: varchar("supplier_type", { length: 50 }),
  typeOfCompany: varchar("type_of_company", { length: 100 }),
  typeOfService: varchar("type_of_service", { length: 100 }),
  // segment_code / segment_label omitted — not present on all DB copies of supp_basic_org_dtls
  licenseNo: varchar("license_no", { length: 100 }),
  taxRegNo: varchar("tax_reg_no", { length: 100 }),
  taxPayerId: varchar("tax_payer_id", { length: 100 }),

  annualTurnOver: numeric("annual_turn_over"),
  turnOverCurrency: varchar("turn_over_currency", { length: 10 }),
  noOfEmployees: integer("no_of_employees"),
  companySize: varchar("company_size", { length: 50 }),
  yearOfExpLocMarket: integer("year_of_exp_loc_market"),
  yearOfExpInternational: integer("year_of_exp_international"),
  legalEntityType: varchar("legal_entity_type", { length: 100 }),
  brandName: varchar("brand_name", { length: 255 }),
  parentCompanyName: varchar("parent_company_name", { length: 255 }),
  parentCompanyAddr: varchar("parent_company_addr", { length: 500 }),
  paymentTerms: varchar("payment_terms", { length: 100 }),
  transactCurr: varchar("transact_curr", { length: 10 }),
  score: integer("score"),
  invitedBidsCount: integer("invited_bids_count"),
  acknowledgeCount: integer("acknowledge_count"),
  responseCount: integer("response_count"),
  userRegistered: varchar("user_registered", { length: 10 }),
  createdBy: varchar("created_by", { length: 255 }),
  creationDate: timestamp("creation_date", { withTimezone: true }),
  lastModifiedBy: varchar("last_modified_by", { length: 255 }),
  lastModifiedDate: timestamp("last_modified_date", { withTimezone: true }),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  // Additional fields for vendor profile
  busTradingDate: timestamp("bus_trading_date", { withTimezone: true }),
  expiryDate: timestamp("expiry_date", { withTimezone: true }),
  workingTimeStartTime: varchar("working_time_start_time", { length: 20 }),
  workingTimeEndTime: varchar("working_time_end_time", { length: 20 }),
  workingdayStart: varchar("workingday_start", { length: 50 }),
  workingdayEnd: varchar("workingday_end", { length: 50 }),
  placeOfIssue: varchar("place_of_issue", { length: 255 }),
  taxEffectiveDate: timestamp("tax_effective_date", { withTimezone: true }),
  approversList: varchar("approvers_list"),
  panNo: varchar("pan_no", { length: 100 }),
  emiratesId: varchar("emirates_id", { length: 100 }),
  prevAddress1: varchar("prev_address1", { length: 500 }),
  prevAddress2: varchar("prev_address2", { length: 500 }),
  prevCity: varchar("prev_city", { length: 100 }),
  prevState: varchar("prev_state", { length: 100 }),
  prevCountry: varchar("prev_country", { length: 100 }),
  prevPostalCode: varchar("prev_postal_code", { length: 20 }),
  prevEmailId: varchar("prev_email_id", { length: 255 }),
  prevPhone: varchar("prev_phone", { length: 50 }),
  prevPhoneAreaCode: varchar("prev_phone_area_code", { length: 10 }),
  prevPhoneCtryCode: varchar("prev_phone_ctry_code", { length: 10 }),
  prevWebAddress: varchar("prev_web_address", { length: 255 }),
  prevLegalEntityType: varchar("prev_leagl_entity_type", { length: 100 }),
  prevLicenseNo: varchar("prev_license_no", { length: 100 }),
  prevPlaceOfIssue: varchar("prev_place_of_issue", { length: 255 }),
  prevExpiryDate: timestamp("prev_expiry_date", { withTimezone: true }),
  prevStartDate: timestamp("prev_start_date", { withTimezone: true }),
  prevBusTradingDate: varchar("prev_bus_trading_date", { length: 255 }),
  prevAnnualTurnOver: numeric("prev_annual_turn_over"),
  prevTurnOverCurrency: varchar("prev_turn_over_currency", { length: 10 }),
  prevPaymentTerms: varchar("prev_payment_trems", { length: 100 }),
  prevTaxRegNo: varchar("prev_tax_reg_no", { length: 100 }),
  prevTaxCountry: varchar("prev_tax_country", { length: 100 }),
  prevTaxPayerId: varchar("prev_tax_payer_id", { length: 100 }),
  prevTaxEffectiveDate: timestamp("prev_tax_effective_date", { withTimezone: true }),
  prevPanNo: varchar("prev_pan_no", { length: 100 }),
  prevSupplierType: varchar("prev_supplier_type", { length: 50 }),
  prevWorkingDayStart: varchar("prev_working_day_start", { length: 50 }),
  prevWorkingDayEnd: varchar("prev_working_day_end", { length: 50 }),
  prevWorkingTimeStartTime: varchar("prev_working_time_start_time", { length: 20 }),
  prevWorkingTimeEndTime: varchar("prev_working_time_end_time", { length: 20 }),
  prevCompanySize: varchar("prev_company_size", { length: 50 }),
  prevNoOfEmployees: integer("prev_no_of_employees"),
  prevBrandName: varchar("prev_brand_name", { length: 255 }),
  prevSegmentCode: varchar("prev_segment_code", { length: 100 }),
  prevSegmentLabel: varchar("prev_segment_label", { length: 255 }),
  prevSubSegmentCode: varchar("prev_sub_segment_code", { length: 100 }),
  prevEmiratesId: varchar("prev_emirates_id", { length: 100 }),
  prevTypeOfService: varchar("prev_type_of_service", { length: 100 }),
  prevYearOfExpLocMarket: integer("prev_year_of_exp_loc_market"),
  prevYearOfExpInternational: integer("prev_year_of_exp_international"),
  prevYearOfExpLocUae: integer("prev_year_of_exp_loc_uae"),
  supplierId: varchar("supplier_id", { length: 50 }),
});

export type DboSupplier = typeof dboSuppliers.$inferSelect;

// DBO Supplier Contacts table (supp_contact_dtls)
export const dboSupplierContacts = dboSchema.table("supp_contact_dtls", {
  id: integer("id").primaryKey(),
  supplierId: integer("supplier_id"),
  contactName: varchar("contact_name", { length: 255 }),
  contactCategory: varchar("contact_category", { length: 100 }),
  contactType: varchar("contact_type", { length: 100 }),
  salutation: varchar("salutation", { length: 20 }),
  designation: varchar("designation", { length: 100 }),
  department: varchar("department", { length: 100 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  phoneCtryCode: varchar("phone_ctry_code", { length: 10 }),
  areacode: varchar("areacode", { length: 10 }),
  mobile: varchar("mobile", { length: 50 }),
  mobileCtryCode: varchar("mobile_ctry_code", { length: 10 }),
  fax: varchar("fax", { length: 50 }),
  faxCtryCode: varchar("fax_ctry_code", { length: 10 }),
  isPrimary: varchar("is_primary", { length: 10 }),
  isAuthSignatory: varchar("is_auth_signatory", { length: 10 }),
  status: integer("status"),
  createdBy: varchar("created_by", { length: 255 }),
  creationDate: timestamp("creation_date", { withTimezone: true }),
  lastModifiedBy: varchar("last_modified_by", { length: 255 }),
  lastModifiedDate: timestamp("last_modified_date", { withTimezone: true }),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  prevContactName: varchar("prev_contact_name", { length: 255 }),
  prevContactCategory: varchar("prev_contact_category", { length: 100 }),
  prevDesignation: varchar("prev_designation", { length: 100 }),
  prevDepartment: varchar("prev_department", { length: 100 }),
  prevEmail: varchar("prev_email", { length: 255 }),
  prevPhone: varchar("prev_phone", { length: 50 }),
  prevMobile: varchar("prev_mobile", { length: 50 }),
  prevIsPrimary: varchar("prev_primary_contact", { length: 10 }),
  prevIsAuthSignatory: varchar("prev_is_auth_signatory", { length: 10 }),
});

export type DboSupplierContact = typeof dboSupplierContacts.$inferSelect;

// DBO Supplier Bank Details table (supp_bank_dtls)
export const dboSupplierBanks = dboSchema.table("supp_bank_dtls", {
  id: integer("id").primaryKey(),
  supplierId: integer("supplier_id"),
  suppSiteId: integer("supp_site_id").notNull(),
  accountNo: varchar("account_no", { length: 100 }).notNull(),
  bankName: varchar("bank_name", { length: 255 }),
  branchName: varchar("branch_name", { length: 255 }),
  bankAddress: varchar("bank_address", { length: 500 }),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }),
  region: varchar("region", { length: 100 }),
  street: varchar("street", { length: 255 }),
  postalCode: varchar("postal_code", { length: 20 }),
  bankAccountType: varchar("bank_account_type", { length: 50 }),
  currency: varchar("currency", { length: 10 }),
  swiftCode: varchar("swift_code", { length: 50 }),
  ibanNo: varchar("iban_no", { length: 50 }),
  ifsccode: varchar("ifsccode", { length: 50 }),
  abaRouting: varchar("aba_routing", { length: 50 }),
  beneficiaryName: varchar("beneficiary_name", { length: 255 }),
  beneficiaryAddress: varchar("beneficiary_address", { length: 500 }),
  primaryAccount: varchar("primary_account", { length: 10 }),
  status: integer("status"),
  createdBy: varchar("created_by", { length: 255 }),
  creationDate: timestamp("creation_date", { withTimezone: true }),
  lastModifiedBy: varchar("last_modified_by", { length: 255 }),
  lastModifiedDate: timestamp("last_modified_date", { withTimezone: true }),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  prevAccountNo: varchar("prev_account_no", { length: 100 }),
  prevBankName: varchar("prev_bank_name", { length: 255 }),
  prevBranchName: varchar("prev_branch_name", { length: 255 }),
  prevBankAddress: varchar("prev_bank_address", { length: 500 }),
  prevCity: varchar("prev_city", { length: 100 }),
  prevCountry: varchar("prev_country", { length: 100 }),
  prevRegion: varchar("prev_region", { length: 100 }),
  prevPostalCode: varchar("prev_postalcode", { length: 20 }),
  prevBankAccountType: varchar("prev_bank_account_type", { length: 50 }),
  prevCurrency: varchar("prev_currency", { length: 10 }),
  prevSwiftCode: varchar("prev_swift_code", { length: 50 }),
  prevIbanNo: varchar("prev_iban_no", { length: 50 }),
  prevIfscCode: varchar("prev_ifsc_code", { length: 50 }),
  prevAbaRouting: varchar("prev_aba_routing", { length: 50 }),
  prevBeneficiaryName: varchar("prev_beneficiary_name", { length: 255 }),
  prevBeneficiaryAddress: varchar("prev_beneficiary_address", { length: 500 }),
  prevPrimaryAccount: varchar("prev_primary_account", { length: 10 }),
});

export type DboSupplierBank = typeof dboSupplierBanks.$inferSelect;

// DBO Supplier Documents table (supp_document_dtls)
export const dboSupplierDocuments = dboSchema.table("supp_document_dtls", {
  id: integer("id").primaryKey(),
  supplierId: integer("supplier_id"),
  docName: varchar("doc_name", { length: 255 }),
  docType: varchar("doc_type", { length: 100 }),
  docNo: varchar("doc_no", { length: 100 }),
  docDesc: varchar("doc_desc", { length: 500 }),
  docPath: varchar("doc_path", { length: 500 }),
  docValue: varchar("doc_value", { length: 255 }),
  category: varchar("category", { length: 100 }),
  filename: varchar("filename", { length: 255 }),
  filetype: varchar("filetype", { length: 100 }),
  expiryDate: timestamp("expiry_date", { withTimezone: true }),
  remarks: varchar("remarks", { length: 500 }),
  recordType: varchar("record_type", { length: 50 }),
  status: varchar("status", { length: 50 }),
  createdBy: varchar("created_by", { length: 255 }),
  creationDate: timestamp("creation_date", { withTimezone: true }),
  lastModifiedBy: varchar("last_modified_by", { length: 255 }),
  lastModifiedDate: timestamp("last_modified_date", { withTimezone: true }),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
});

export type DboSupplierDocument = typeof dboSupplierDocuments.$inferSelect;

// DBO Supplier Scope of Supply/Service table (supp_scope_of_supply_service)
export const dboSupplierServices = dboSchema.table("supp_scope_of_supply_service", {
  id: integer("id").primaryKey(),
  supplierId: integer("supplier_id"),
  categoryCode: varchar("category_code", { length: 50 }),
  subCategory: varchar("sub_category", { length: 255 }),
  subCategoryCode: varchar("sub_category_code", { length: 50 }),
  goodServiceCode: varchar("good_service_code", { length: 50 }),
  serviceDetails: varchar("service_details", { length: 500 }),
  contactDetails: varchar("contact_details", { length: 500 }),
  dpworldTerminal: varchar("dpworld_terminal", { length: 255 }),
  isExisting: varchar("is_existing", { length: 10 }),
  categoryType: varchar("category_type", { length: 100 }),
  status: integer("status"),
  createdBy: varchar("created_by", { length: 255 }),
  creationDate: timestamp("creation_date", { withTimezone: true }),
  lastModifiedBy: varchar("last_modified_by", { length: 255 }),
  lastModifiedDate: timestamp("last_modified_date", { withTimezone: true }),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
});

export type DboSupplierService = typeof dboSupplierServices.$inferSelect;

// DBO Supplier Reference Companies table (supp_ref_companies_dtls)
export const dboSupplierRefCompanies = dboSchema.table("supp_ref_companies_dtls", {
  id: integer("id").primaryKey(),
  supplierId: integer("supplier_id"),
  refCompanyName: varchar("ref_company_name", { length: 255 }),
  contactName: varchar("contact_name", { length: 255 }),
  designation: varchar("designation", { length: 100 }),
  department: varchar("department", { length: 100 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  phoneCtryCode: varchar("phone_ctry_code", { length: 10 }),
  areacode: varchar("areacode", { length: 10 }),
  mobile: varchar("mobile", { length: 50 }),
  mobileCtryCode: varchar("mobile_ctry_code", { length: 10 }),
  url: varchar("url", { length: 500 }),
  refCity: varchar("ref_city", { length: 100 }),
  refCountry: varchar("ref_country", { length: 100 }),
  aedValue: varchar("aed_value", { length: 50 }),
  scopeWork: varchar("scope_work", { length: 500 }),
  currency: varchar("currency", { length: 10 }),
  status: integer("status"),
  createdBy: varchar("created_by", { length: 255 }),
  creationDate: timestamp("creation_date", { withTimezone: true }),
});

export type DboSupplierRefCompany = typeof dboSupplierRefCompanies.$inferSelect;

// DBO Supplier Registration Approval Details table (supp_regstr_appr_dtls)
export const dboSupplierApprovalHistory = dboSchema.table("supp_regstr_appr_dtls", {
  id: integer("id").primaryKey(),
  supplierId: integer("supplier_id"),
  approvedDate: timestamp("approved_date", { withTimezone: true }),
  approverId: integer("approver_id"),
  approverLevel: integer("approver_level"),
  approverName: varchar("approver_name", { length: 255 }),
  approverRoleId: integer("approver_role_id"),
  attribute1: varchar("attribute_1", { length: 255 }),
  attribute2: varchar("attribute_2", { length: 255 }),
  attribute9: varchar("attribute_9", { length: 255 }),
  attribute10: varchar("attribute_10", { length: 255 }),
  comments: varchar("comments", { length: 1000 }),
  createdBy: varchar("created_by", { length: 255 }),
  creationDate: timestamp("creation_date", { withTimezone: true }),
  ipAddress: varchar("ip_address", { length: 50 }),
  lastModifiedBy: varchar("last_modified_by", { length: 255 }),
  lastModifiedDate: timestamp("last_modified_date", { withTimezone: true }),
  requestedDate: timestamp("requested_date", { withTimezone: true }),
  status: varchar("status", { length: 50 }),
  objectId: varchar("object_id", { length: 100 }),
});

export type DboSupplierApprovalHistory = typeof dboSupplierApprovalHistory.$inferSelect;

// User roles
export const userRoles = ["vendor", "procurement_officer", "admin"] as const;
export type UserRole = typeof userRoles[number];

export const users = dboSchema.table("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("vendor"),
  vendorId: varchar("vendor_id"),
  displayName: text("display_name"),
  email: text("email"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  role: true,
  vendorId: true,
  displayName: true,
  email: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Vendor statuses
export const vendorStatuses = ["draft", "pending", "under_review", "approved", "rejected"] as const;
export type VendorStatus = typeof vendorStatuses[number];

// Vendor types
export const vendorTypes = ["individual", "company", "partnership", "llp", "trust"] as const;
export type VendorType = typeof vendorTypes[number];

// Business categories
export const businessCategories = [
  "it_services",
  "manufacturing",
  "raw_materials",
  "construction",
  "logistics",
  "consulting",
  "healthcare",
  "utilities",
  "other"
] as const;
export type BusinessCategory = typeof businessCategories[number];

// Document types
export const documentTypes = [
  "pan_card",
  "gst_certificate",
  "company_registration",
  "bank_letter",
  "cancelled_cheque",
  "iso_certificate",
  "msme_certificate",
  "other"
] as const;
export type DocumentType = typeof documentTypes[number];

// Document validation statuses
export const documentStatuses = ["pending", "validated", "rejected", "expired"] as const;
export type DocumentStatus = typeof documentStatuses[number];


// Purchase Request statuses
export const prStatuses = ["draft", "pending_approval", "approved", "fulfilled", "cancelled"] as const;
export type PrStatus = typeof prStatuses[number];

// Purchase Request priorities
export const prPriorities = ["low", "medium", "high", "urgent"] as const;
export type PrPriority = typeof prPriorities[number];

// Units of Measure
export const unitsOfMeasure = ["EA", "PC", "KG", "LT", "MT", "BOX", "SET", "HR", "DAY", "LOT"] as const;
export type UnitOfMeasure = typeof unitsOfMeasure[number];

// Category levels for UNSPSC hierarchy
export const categoryLevels = ["segment", "family", "class", "commodity"] as const;
export type CategoryLevel = typeof categoryLevels[number];

// Categories table (UNSPSC-based hierarchy)
export const categories = dboSchema.table("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  level: text("level").notNull().default("commodity"),
  parentCode: text("parent_code"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
});

export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;


// Item statuses
export const itemStatuses = ["active", "inactive", "discontinued"] as const;
export type ItemStatus = typeof itemStatuses[number];

// Items table (Item Master)
export const items = dboSchema.table("items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemCode: text("item_code").notNull().unique(),
  description: text("description"),
  name: text("name").notNull(),
  categoryCode: text("category_code"),
  categoryName: text("category_name"),
  taxCode: text("tax_code"),
  unitOfMeasure: text("unit_of_measure").notNull().default("EA"),
  standardPrice: integer("standard_price"),
  currency: text("currency").notNull().default("INR"),
  manufacturer: text("manufacturer"),
  manufacturerPartNumber: text("manufacturer_part_number"),
  leadTimeDays: integer("lead_time_days"),
  minOrderQuantity: integer("min_order_quantity").default(1),
  status: text("status").notNull().default("active"),
  isActive: boolean("is_active").notNull().default(true),
  productSpecification: text("product_specification"),
  productHSN: text("product_hsn"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const insertItemSchema = createInsertSchema(items).omit({
  id: true,
  updatedAt: true,
});

export type InsertItem = z.infer<typeof insertItemSchema>;
export type Item = typeof items.$inferSelect;

// Extension for UI-only or joined fields
export type ItemWithSpecs = Item & {
  productSpecification?: string | null;
  productHSN?: string | null;
  categoryName?: string | null;
};

// AI Suggestions for form fields
export interface FieldSuggestion {
  field: string;
  suggestion: string;
  confidence: number;
  explanation: string;
}

// OCR extraction result
export interface OcrExtractionResult {
  documentType: DocumentType;
  extractedFields: Record<string, string>;
  confidenceScore: number;
  warnings: string[];
}

// Category suggestion result
export interface CategorySuggestion {
  code: string;
  name: string;
  confidence: number;
  description: string;
}


// Workflow statuses
export const workflowStatuses = ["draft", "active", "paused", "archived"] as const;
export type WorkflowStatus = typeof workflowStatuses[number];

// Workflow run statuses
export const workflowRunStatuses = ["running", "completed", "failed", "paused", "cancelled"] as const;
export type WorkflowRunStatus = typeof workflowRunStatuses[number];

// Approval statuses
export const approvalStatuses = ["pending", "approved", "rejected", "expired"] as const;
export type ApprovalStatus = typeof approvalStatuses[number];

// Um Org Map Dtls
export const umOrgMapDtls = dboSchema.table("um_user_org_map_dtls", {
  id: integer("id").primaryKey(),
  attribute1: text("attribute_1"),
  attribute2: text("attribute_2"),
  attribute3: text("attribute_3"),
  attribute4: text("attribute_4"),
  companyCode: text("company_code"),
  createdBy: text("created_by"),
  creationDate: timestamp("creation_date"),
  orgLegalName: text("org_legal_name"),
  ipAddress: text("ip_address"),
  lastModifiedBy: text("last_modified_by"),
  lastModifiedDate: timestamp("last_modified_date"),
  organizationName: text("organization_name"),
  orgType: text("org_type"),
  orgId: integer("org_id"),
  userId: integer("user_id"),
});

// ---------------------------------------------------------------------------
// TAT (turnaround-time) module — dbo tables
// ---------------------------------------------------------------------------

export const amTatRules = dboSchema.table("am_tat_rules", {
  id: serial("id").primaryKey(),
  moduleKey: varchar("module_key", { length: 50 }).notNull(),
  subType: varchar("sub_type", { length: 50 }),
  stageOrder: integer("stage_order").notNull(),
  stageName: varchar("stage_name", { length: 255 }).notNull(),
  stageType: varchar("stage_type", { length: 50 }).notNull(),
  tatDays: integer("tat_days").notNull(),
  approverStepId: integer("approver_step_id"),
  isSupplierStage: boolean("is_supplier_stage").default(false),
  escalateToSupplier: boolean("escalate_to_supplier").default(false),
  isEditable: boolean("is_editable").default(true),
  createdBy: varchar("created_by", { length: 255 }),
  updatedBy: varchar("updated_by", { length: 255 }),
  createdDate: timestamp("created_date", { withTimezone: true }).defaultNow(),
  updatedDate: timestamp("updated_date", { withTimezone: true }).defaultNow(),
});

export type AmTatRule = typeof amTatRules.$inferSelect;
export type InsertAmTatRule = typeof amTatRules.$inferInsert;

export const amTatLogs = dboSchema.table("am_tat_logs", {
  id: serial("id").primaryKey(),
  moduleKey: varchar("module_key", { length: 50 }),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: varchar("entity_id", { length: 100 }).notNull(),
  stageOrder: integer("stage_order"),
  stageName: varchar("stage_name", { length: 255 }),
  tatDaysAllowed: integer("tat_days_allowed"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  dueAt: timestamp("due_at", { withTimezone: true }),
  status: varchar("status", { length: 50 }).default("pending"),
  ownerName: varchar("owner_name", { length: 255 }),
  ownerEmail: varchar("owner_email", { length: 255 }),
  isSupplierStage: boolean("is_supplier_stage").default(false),
  actualDays: integer("actual_days"),
  isOverdue: boolean("is_overdue").default(false),
  overdueDays: integer("overdue_days").default(0),
});

export type AmTatLog = typeof amTatLogs.$inferSelect;
export type InsertAmTatLog = typeof amTatLogs.$inferInsert;

export const amTatEscalations = dboSchema.table("am_tat_escalations", {
  id: serial("id").primaryKey(),
  tatLogId: integer("tat_log_id"),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: varchar("entity_id", { length: 100 }).notNull(),
  stageName: varchar("stage_name", { length: 255 }),
  escalatedFromUserId: varchar("escalated_from_user_id", { length: 100 }),
  escalatedFromName: varchar("escalated_from_name", { length: 255 }),
  escalatedToUserId: varchar("escalated_to_user_id", { length: 100 }),
  escalatedToName: varchar("escalated_to_name", { length: 255 }),
  ccUserIds: text("cc_user_ids").array(),
  ccNames: text("cc_names").array(),
  remark: text("remark"),
  escalatedBy: varchar("escalated_by", { length: 255 }),
  isSupplierEscalation: boolean("is_supplier_escalation").default(false),
  escalatedAt: timestamp("escalated_at", { withTimezone: true }).defaultNow(),
});

export type AmTatEscalation = typeof amTatEscalations.$inferSelect;
export type InsertAmTatEscalation = typeof amTatEscalations.$inferInsert;

export const amTatMissedAlerts = dboSchema.table("am_tat_missed_alerts", {
  id: serial("id").primaryKey(),
  tatLogId: integer("tat_log_id"),
  missedReason: text("missed_reason"),
  remark: text("remark"),
  updatedBy: varchar("updated_by", { length: 255 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type AmTatMissedAlert = typeof amTatMissedAlerts.$inferSelect;
export type InsertAmTatMissedAlert = typeof amTatMissedAlerts.$inferInsert;

export const amTatIgnored = dboSchema.table("am_tat_ignored", {
  id: serial("id").primaryKey(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: varchar("entity_id", { length: 100 }).notNull(),
  stageName: varchar("stage_name", { length: 255 }),
  reason: text("reason"),
  ignoredBy: varchar("ignored_by", { length: 255 }),
  ignoredAt: timestamp("ignored_at", { withTimezone: true }).defaultNow(),
});

export type AmTatIgnored = typeof amTatIgnored.$inferSelect;
export type InsertAmTatIgnored = typeof amTatIgnored.$inferInsert;

// ---------------------------------------------------------------------------
// Invoice PO reconciliation (AI matching persistence)
// Tables are also ensured at runtime via invoice-reconciliation.ts
// ---------------------------------------------------------------------------

export const poReconciliation = dboSchema.table("po_reconciliation", {
  id: serial("id").primaryKey(),
  poNumber: varchar("po_number", { length: 100 }).notNull(),
  poLineId: integer("po_line_id"),
  poLineNumber: varchar("po_line_number", { length: 50 }).notNull(),
  totalPoQty: numeric("total_po_qty", { precision: 18, scale: 4 }).notNull().default("0"),
  totalGrnQty: numeric("total_grn_qty", { precision: 18, scale: 4 }).notNull().default("0"),
  totalInvoiceQty: numeric("total_invoice_qty", { precision: 18, scale: 4 }).notNull().default("0"),
  balanceQty: numeric("balance_qty", { precision: 18, scale: 4 }).notNull().default("0"),
  status: varchar("status", { length: 50 }).notNull(),
  triggeredByInvoiceId: varchar("triggered_by_invoice_id", { length: 100 }),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invoiceGrnAllocation = dboSchema.table("invoice_grn_allocation", {
  id: serial("id").primaryKey(),
  invoiceLineId: integer("invoice_line_id").notNull(),
  grnLineId: integer("grn_line_id").notNull(),
  poNumber: varchar("po_number", { length: 100 }),
  poLineId: integer("po_line_id"),
  poLineNumber: varchar("po_line_number", { length: 50 }),
  allocatedQty: numeric("allocated_qty", { precision: 18, scale: 4 }).notNull(),
  triggeredByInvoiceId: varchar("triggered_by_invoice_id", { length: 100 }),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PoReconciliationRow = typeof poReconciliation.$inferSelect;
export type InvoiceGrnAllocationRow = typeof invoiceGrnAllocation.$inferSelect;

export type UmOrgMapDtl = typeof umOrgMapDtls.$inferSelect;