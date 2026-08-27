-- Migration: FMPI published snapshots + supplier visibility flag on bids
--
-- FMPI computation itself stays stateless (see shared/schema.ts FmpSnapshot).
-- This table is NOT a cache: it is the published record of the benchmark that
-- was shown to suppliers on a given document line, so every invited supplier
-- sees the identical anchor price and the number stays disputable after the
-- fact. Generic on purpose (doc_type) so PR / BID / PO all reuse one table.

CREATE TABLE IF NOT EXISTS dbo.supp_fmp_snapshot_dtls (
  id                      SERIAL PRIMARY KEY,
  doc_type                VARCHAR(10)   NOT NULL,   -- 'BID' | 'PR' | 'PO'
  doc_id                  VARCHAR(50)   NOT NULL,   -- bidrefno / pr no / po no
  doc_line_id             BIGINT        NOT NULL,   -- supp_bid_line_dtls.id etc.

  item_id                 VARCHAR(50),
  item_name               VARCHAR(500),
  product_category        INTEGER,
  currency                VARCHAR(10),
  quantity                NUMERIC(18, 4),
  delivery_location       VARCHAR(255),

  fair_market_price       NUMERIC(18, 4),
  range_min               NUMERIC(18, 4),
  range_max               NUMERIC(18, 4),
  total_fair_market_price NUMERIC(18, 4),
  total_range_min         NUMERIC(18, 4),
  total_range_max         NUMERIC(18, 4),

  confidence_score        INTEGER,
  price_trend_direction   VARCHAR(20),
  sources_used_count      INTEGER,
  sources_used_list       TEXT,
  reasoning               TEXT,

  calculated_by           VARCHAR(100),
  calculated_date         TIMESTAMPTZ   DEFAULT NOW(),
  last_updated_by         VARCHAR(100),
  last_updated_date       TIMESTAMPTZ   DEFAULT NOW()
);

-- One live snapshot per document line; writes upsert on this key.
CREATE UNIQUE INDEX IF NOT EXISTS ux_supp_fmp_snapshot_doc_line
  ON dbo.supp_fmp_snapshot_dtls (doc_type, doc_id, doc_line_id);

CREATE INDEX IF NOT EXISTS ix_supp_fmp_snapshot_doc
  ON dbo.supp_fmp_snapshot_dtls (doc_type, doc_id);

-- Buyer-controlled: when true, invited suppliers see the fair market price and
-- range on each bid line. Defaults false so existing bids are unaffected.
ALTER TABLE dbo.supp_bid_dtls
  ADD COLUMN IF NOT EXISTS show_fmp_to_supplier BOOLEAN NOT NULL DEFAULT FALSE;
