import { relations } from "drizzle-orm";

import {
  auctionSuppResponseEvent,
  auctionSuppResponseRow,
  auctionSuppResponseAttachment,
  auctionSuppResponseEventHistory,
  auctionSuppResponseRowHistory,
  auctionSuppResponseColumnValuesHistory,
  auctionSuppEventResponseTemplateColumnValues,
  auctionEvent,
  auctionEventSuppMapping,
  auctionEventTemplateRowMapping,
  auctionEventTnCMapping,
  auctionEventTemplateColumnValues,
  auctionEventSuppWiseCap,
} from "@shared/schema";


export const auctionRelations = relations(
  auctionEvent,
  ({  many }) => ({
    suppIds: many(auctionEventSuppMapping),
    tncIds: many(auctionEventTnCMapping),
    templateRows: many(auctionEventTemplateRowMapping),
  })
);

export const auctionEventSuppMappingRelations = relations(
  auctionEventSuppMapping,
  ({ one }) => ({
    event: one(auctionEvent, {
      fields: [auctionEventSuppMapping.eventId],
      references: [auctionEvent.id],
    }),
  })
);

export const auctionEventTemplateRowMappingRelations = relations(
  auctionEventTemplateRowMapping,
  ({ one, many }) => ({
    event: one(auctionEvent, {
      fields: [auctionEventTemplateRowMapping.eventId],
      references: [auctionEvent.id],
    }),
    columnValues: many(auctionEventTemplateColumnValues),
    suppWiseCap: many(auctionEventSuppWiseCap),
  })
);

export const auctionEventTemplateColumnValuesRelations = relations(
  auctionEventTemplateColumnValues,
  ({ one }) => ({
    row: one(auctionEventTemplateRowMapping, {
      fields: [auctionEventTemplateColumnValues.rowId],
      references: [auctionEventTemplateRowMapping.id],
    }),
  })
);

export const auctionEventSuppWiseCapRelations = relations(
  auctionEventSuppWiseCap,
  ({ one }) => ({
    row: one(auctionEventTemplateRowMapping, {
      fields: [auctionEventSuppWiseCap.rowId],
      references: [auctionEventTemplateRowMapping.id],
    }),
  })
);

export const auctionEventTnCMappingRelations = relations(
  auctionEventTnCMapping,
  ({ one }) => ({
    event: one(auctionEvent, {
      fields: [auctionEventTnCMapping.eventId],
      references: [auctionEvent.id],
    }),
  })
);

export const historyRelations = relations(
  auctionSuppResponseEventHistory,
  ({ many }) => ({
    templateResponseRows: many(auctionSuppResponseRowHistory),
  })
);

export const auctionSuppResponseRowHistoryRelations = relations(
  auctionSuppResponseRowHistory,
  ({ one, many }) => ({
    // 🔹 ManyToOne → Parent
    parent: one(auctionSuppResponseEventHistory, {
      fields: [auctionSuppResponseRowHistory.auSuppEventRespId],
      references: [auctionSuppResponseEventHistory.id],
    }),

    // 🔹 OneToMany → Column Values
    columnResponseValues: many(
      auctionSuppResponseColumnValuesHistory
    ),
  })
);

export const auctionSuppResponseColumnValuesHistoryRelations =
  relations(auctionSuppResponseColumnValuesHistory, ({ one }) => ({
    // 🔹 ManyToOne → Row History
    row: one(auctionSuppResponseRowHistory, {
      fields: [auctionSuppResponseColumnValuesHistory.auSuppEventRespRowId],
      references: [auctionSuppResponseRowHistory.id],
    }),
  }));

  export const auctionSuppResponseRelations = relations(
  auctionSuppResponseEvent,
  ({ many }) => ({
    // 🔥 Equivalent to templateResponseRows
    templateResponseRows: many(auctionSuppResponseRow),

    // 🔥 Equivalent to auctionSuppRespAttachment
    auctionSuppRespAttachment: many(
      auctionSuppResponseAttachment
    ),
  })
);

export const auctionResponseRowRelations = relations(
  auctionSuppResponseRow,
  ({ one, many }) => ({
    response: one(auctionSuppResponseEvent, {
      fields: [auctionSuppResponseRow.auctionSuppRespId],
      references: [auctionSuppResponseEvent.id],
    }),
    columnResponseValues: many(auctionSuppEventResponseTemplateColumnValues),
  })
);

export const auctionSuppEventResponseTemplateColumnValuesRelations = relations(
  auctionSuppEventResponseTemplateColumnValues,
  ({ one }) => ({
    row: one(auctionSuppResponseRow, {
      fields: [auctionSuppEventResponseTemplateColumnValues.auctionSuppRespRowId],
      references: [auctionSuppResponseRow.id],
    }),
  })
);
export const auctionResponseAttachmentRelations = relations(
  auctionSuppResponseAttachment,
  ({ one }) => ({
    response: one(auctionSuppResponseEvent, {
      fields: [auctionSuppResponseAttachment.auctionSuppRespId],
      references: [auctionSuppResponseEvent.id],
    }),
  })
);