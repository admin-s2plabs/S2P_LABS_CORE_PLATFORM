-- =============================================================================
-- Prokraya — Auctions module: PostgreSQL DDL (manual migration)
--
-- Consolidates former startup logic from server/db/ensureAuctionTemplateSchema.ts
-- plus legacy one-off scripts under this folder. Run against each DB when
-- provisioning or upgrading auction features.
--
-- Covers:
--   • CREATE SCHEMA / missing dbo tables (broadcast, supplier bid response, caps)
--   • au_auction_event_template column widens (all schemas that contain the table)
--   • Legacy INTEGER id columns without SERIAL: sequence + DEFAULT nextval(...)
--   • Sequences aligned with auctionEvents.service.ts (ensureDboAuctionInsertSequences,
--     ensureAuctionAwardInsertSequences, broadcast / order activity helpers)
--
-- If tables live in "public" instead of "dbo", replace dbo → public below, or run
-- only the dynamic widen block (it scans information_schema).
--
-- Apply:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/db/migrations/auctions_database_updates.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) Schema
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS dbo;

-- ---------------------------------------------------------------------------
-- 1) Tables (CREATE IF NOT EXISTS) — fresh DBs / partial installs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dbo.au_auction_broadcast_message (
  id SERIAL PRIMARY KEY,
  broad_cast_message VARCHAR(1000),
  auction_id BIGINT,
  created_by VARCHAR(255),
  creation_time TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_au_auction_broadcast_message_auction_id
  ON dbo.au_auction_broadcast_message (auction_id);

CREATE TABLE IF NOT EXISTS dbo.au_auction_supp_event_response (
  id SERIAL PRIMARY KEY,
  auction_id BIGINT,
  supplier_id BIGINT,
  auction_name TEXT,
  supplier_name TEXT,
  supplier_contact TEXT,
  site_id INTEGER,
  supplier_site TEXT,
  supplier_contact_no TEXT,
  supplier_contact_email TEXT,
  auction_total NUMERIC,
  supp_rank INTEGER,
  gross_total NUMERIC,
  version TEXT,
  supp_comments TEXT,
  template_id BIGINT,
  auction_type TEXT,
  orgid INTEGER,
  auction_strategy TEXT,
  auction_duration INTEGER,
  auction_duration_units TEXT,
  is_scheduled_event TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  delivery_date TIMESTAMPTZ,
  allotment_type TEXT,
  if_bid_in_last_minutes_in_mins INTEGER,
  acution_time_extension_in_mins INTEGER,
  auction_saving_measure TEXT,
  auction_saving_reference TEXT,
  auction_saving_reference_value TEXT,
  currency TEXT,
  status TEXT,
  bid_time TIMESTAMPTZ,
  creation_time TIMESTAMPTZ,
  last_modification_time TIMESTAMPTZ,
  created_by TEXT,
  last_modified_by TEXT,
  attribute1 INTEGER DEFAULT 0,
  attribute2 TEXT,
  attribute3 TEXT,
  attribute4 TEXT,
  attribute5 TEXT,
  attribute6 TEXT,
  attribute7 TEXT,
  attribute8 TEXT,
  attribute9 TEXT,
  attribute10 TEXT,
  attribute11 TEXT,
  attribute12 TEXT,
  attribute13 TEXT,
  attribute14 TEXT,
  attribute15 TEXT,
  supp_resp_docs_mapping TEXT,
  place_proxy TEXT,
  is_basket TEXT,
  basket_auction_duration INTEGER
);

CREATE TABLE IF NOT EXISTS dbo.au_auction_supp_event_response_row (
  id SERIAL PRIMARY KEY,
  template_id TEXT,
  au_supp_event_resp_id INTEGER NOT NULL,
  au_row_id BIGINT,
  line_item_total NUMERIC,
  line_item_base_price NUMERIC,
  buyer_docs_mapping TEXT,
  supp_docs_mapping TEXT,
  created_by TEXT,
  creation_time TIMESTAMPTZ,
  last_modification_time TIMESTAMPTZ,
  last_modified_by TEXT,
  supp_product_rank INTEGER,
  savings_amount NUMERIC,
  basket_auction_status TEXT
);

CREATE TABLE IF NOT EXISTS dbo.au_auction_supp_event_response_template_column_values (
  id SERIAL PRIMARY KEY,
  column_id TEXT,
  column_key TEXT,
  column_value TEXT,
  supp_rsp_column_value TEXT,
  au_supp_event_resp_row_id INTEGER NOT NULL,
  created_by TEXT,
  creation_time TIMESTAMPTZ,
  last_modification_time TIMESTAMPTZ,
  last_modified_by TEXT
);

CREATE TABLE IF NOT EXISTS dbo.au_auction_event_supp_wise_cap (
  id SERIAL PRIMARY KEY,
  creation_time TIMESTAMPTZ,
  last_modification_time TIMESTAMPTZ,
  created_by TEXT,
  last_modified_by TEXT,
  supp_id INTEGER,
  supplier_name TEXT,
  price NUMERIC(10, 2),
  row_id INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_au_auction_event_supp_wise_cap_row_id
  ON dbo.au_auction_event_supp_wise_cap (row_id);

-- ---------------------------------------------------------------------------
-- 2) Widen au_auction_event_template (every schema that has the table)
--    attribute1 → TEXT; name, created_by, last_modified_by → VARCHAR(255) if short
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sch text;
  qual text;
  dt text;
  maxlen integer;
  col text;
BEGIN
  FOR sch IN
    SELECT DISTINCT t.table_schema::text
    FROM information_schema.tables t
    WHERE t.table_name = 'au_auction_event_template'
  LOOP
    qual := format('%I.%I', sch, 'au_auction_event_template');

    SELECT c.data_type INTO dt
    FROM information_schema.columns c
    WHERE c.table_schema = sch
      AND c.table_name = 'au_auction_event_template'
      AND c.column_name = 'attribute1';

    IF FOUND AND dt IS NOT NULL AND dt <> 'text' THEN
      EXECUTE format(
        'ALTER TABLE %s ALTER COLUMN attribute1 TYPE TEXT USING attribute1::text',
        qual
      );
      RAISE NOTICE '%.au_auction_event_template.attribute1 widened to TEXT', sch;
    END IF;

    FOREACH col IN ARRAY ARRAY['name', 'created_by', 'last_modified_by']
    LOOP
      SELECT c.data_type, c.character_maximum_length
        INTO dt, maxlen
      FROM information_schema.columns c
      WHERE c.table_schema = sch
        AND c.table_name = 'au_auction_event_template'
        AND c.column_name = col;

      IF NOT FOUND THEN
        CONTINUE;
      END IF;
      IF dt = 'text' THEN
        CONTINUE;
      END IF;
      IF dt = 'character varying'
         AND maxlen IS NOT NULL
         AND maxlen < 255
      THEN
        EXECUTE format(
          'ALTER TABLE %s ALTER COLUMN %I TYPE VARCHAR(255) USING LEFT(COALESCE(%I::text, ''''), 255)',
          qual,
          col,
          col
        );
        RAISE NOTICE '%.au_auction_event_template.% widened to VARCHAR(255)', sch, col;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Legacy id: sequence + setval + DEFAULT nextval (skip if identity/nextval)
--    Each block no-ops when the table is missing.
-- ---------------------------------------------------------------------------

-- dbo.au_auction_order_activity
CREATE SEQUENCE IF NOT EXISTS dbo.au_auction_order_activity_id_seq;
DO $$
DECLARE
  _setv BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dbo' AND table_name = 'au_auction_order_activity'
  ) THEN
    RETURN;
  END IF;
  SELECT setval(
    'dbo.au_auction_order_activity_id_seq'::regclass,
    GREATEST(COALESCE((SELECT MAX(id) FROM dbo.au_auction_order_activity), 0), 1),
    (SELECT MAX(id) FROM dbo.au_auction_order_activity) IS NOT NULL
  ) INTO _setv;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'dbo' AND c.table_name = 'au_auction_order_activity'
      AND c.column_name = 'id' AND COALESCE(c.is_identity, 'NO') <> 'YES'
      AND (c.column_default IS NULL OR c.column_default NOT ILIKE '%nextval%')
  ) THEN
    ALTER TABLE dbo.au_auction_order_activity
      ALTER COLUMN id SET DEFAULT nextval('dbo.au_auction_order_activity_id_seq'::regclass);
    ALTER SEQUENCE dbo.au_auction_order_activity_id_seq OWNED BY dbo.au_auction_order_activity.id;
    RAISE NOTICE 'au_auction_order_activity.id DEFAULT bound to au_auction_order_activity_id_seq';
  END IF;
END $$;

-- dbo.au_auction_event_template
CREATE SEQUENCE IF NOT EXISTS dbo.au_auction_event_template_id_seq;
DO $$
DECLARE
  _setv BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dbo' AND table_name = 'au_auction_event_template'
  ) THEN
    RETURN;
  END IF;
  SELECT setval(
    'dbo.au_auction_event_template_id_seq'::regclass,
    GREATEST(COALESCE((SELECT MAX(id) FROM dbo.au_auction_event_template), 0), 1),
    (SELECT MAX(id) FROM dbo.au_auction_event_template) IS NOT NULL
  ) INTO _setv;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'dbo' AND c.table_name = 'au_auction_event_template'
      AND c.column_name = 'id' AND COALESCE(c.is_identity, 'NO') <> 'YES'
      AND (c.column_default IS NULL OR c.column_default NOT ILIKE '%nextval%')
  ) THEN
    ALTER TABLE dbo.au_auction_event_template
      ALTER COLUMN id SET DEFAULT nextval('dbo.au_auction_event_template_id_seq'::regclass);
    ALTER SEQUENCE dbo.au_auction_event_template_id_seq OWNED BY dbo.au_auction_event_template.id;
    RAISE NOTICE 'au_auction_event_template.id DEFAULT bound to au_auction_event_template_id_seq';
  END IF;
END $$;

-- dbo.au_auction_event
CREATE SEQUENCE IF NOT EXISTS dbo.au_auction_event_id_seq;
DO $$
DECLARE
  _setv BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dbo' AND table_name = 'au_auction_event'
  ) THEN
    RETURN;
  END IF;
  SELECT setval(
    'dbo.au_auction_event_id_seq'::regclass,
    GREATEST(COALESCE((SELECT MAX(id) FROM dbo.au_auction_event), 0), 1),
    (SELECT MAX(id) FROM dbo.au_auction_event) IS NOT NULL
  ) INTO _setv;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'dbo' AND c.table_name = 'au_auction_event'
      AND c.column_name = 'id' AND COALESCE(c.is_identity, 'NO') <> 'YES'
      AND (c.column_default IS NULL OR c.column_default NOT ILIKE '%nextval%')
  ) THEN
    ALTER TABLE dbo.au_auction_event
      ALTER COLUMN id SET DEFAULT nextval('dbo.au_auction_event_id_seq'::regclass);
    ALTER SEQUENCE dbo.au_auction_event_id_seq OWNED BY dbo.au_auction_event.id;
    RAISE NOTICE 'au_auction_event.id DEFAULT bound to au_auction_event_id_seq';
  END IF;
END $$;

-- dbo.au_auction_event_template_row_mapping
CREATE SEQUENCE IF NOT EXISTS dbo.au_auction_event_template_row_mapping_id_seq;
DO $$
DECLARE
  _setv BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dbo' AND table_name = 'au_auction_event_template_row_mapping'
  ) THEN
    RETURN;
  END IF;
  SELECT setval(
    'dbo.au_auction_event_template_row_mapping_id_seq'::regclass,
    GREATEST(COALESCE((SELECT MAX(id) FROM dbo.au_auction_event_template_row_mapping), 0), 1),
    (SELECT MAX(id) FROM dbo.au_auction_event_template_row_mapping) IS NOT NULL
  ) INTO _setv;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'dbo' AND c.table_name = 'au_auction_event_template_row_mapping'
      AND c.column_name = 'id' AND COALESCE(c.is_identity, 'NO') <> 'YES'
      AND (c.column_default IS NULL OR c.column_default NOT ILIKE '%nextval%')
  ) THEN
    ALTER TABLE dbo.au_auction_event_template_row_mapping
      ALTER COLUMN id SET DEFAULT nextval('dbo.au_auction_event_template_row_mapping_id_seq'::regclass);
    ALTER SEQUENCE dbo.au_auction_event_template_row_mapping_id_seq
      OWNED BY dbo.au_auction_event_template_row_mapping.id;
    RAISE NOTICE 'au_auction_event_template_row_mapping.id DEFAULT bound';
  END IF;
END $$;

-- dbo.au_auction_event_template_column_values
CREATE SEQUENCE IF NOT EXISTS dbo.au_auction_event_template_column_values_id_seq;
DO $$
DECLARE
  _setv BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dbo' AND table_name = 'au_auction_event_template_column_values'
  ) THEN
    RETURN;
  END IF;
  SELECT setval(
    'dbo.au_auction_event_template_column_values_id_seq'::regclass,
    GREATEST(COALESCE((SELECT MAX(id) FROM dbo.au_auction_event_template_column_values), 0), 1),
    (SELECT MAX(id) FROM dbo.au_auction_event_template_column_values) IS NOT NULL
  ) INTO _setv;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'dbo' AND c.table_name = 'au_auction_event_template_column_values'
      AND c.column_name = 'id' AND COALESCE(c.is_identity, 'NO') <> 'YES'
      AND (c.column_default IS NULL OR c.column_default NOT ILIKE '%nextval%')
  ) THEN
    ALTER TABLE dbo.au_auction_event_template_column_values
      ALTER COLUMN id SET DEFAULT nextval('dbo.au_auction_event_template_column_values_id_seq'::regclass);
    ALTER SEQUENCE dbo.au_auction_event_template_column_values_id_seq
      OWNED BY dbo.au_auction_event_template_column_values.id;
    RAISE NOTICE 'au_auction_event_template_column_values.id DEFAULT bound';
  END IF;
END $$;

-- dbo.au_auction_event_supp_mapping
CREATE SEQUENCE IF NOT EXISTS dbo.au_auction_event_supp_mapping_id_seq;
DO $$
DECLARE
  _setv BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dbo' AND table_name = 'au_auction_event_supp_mapping'
  ) THEN
    RETURN;
  END IF;
  SELECT setval(
    'dbo.au_auction_event_supp_mapping_id_seq'::regclass,
    GREATEST(COALESCE((SELECT MAX(id) FROM dbo.au_auction_event_supp_mapping), 0), 1),
    (SELECT MAX(id) FROM dbo.au_auction_event_supp_mapping) IS NOT NULL
  ) INTO _setv;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'dbo' AND c.table_name = 'au_auction_event_supp_mapping'
      AND c.column_name = 'id' AND COALESCE(c.is_identity, 'NO') <> 'YES'
      AND (c.column_default IS NULL OR c.column_default NOT ILIKE '%nextval%')
  ) THEN
    ALTER TABLE dbo.au_auction_event_supp_mapping
      ALTER COLUMN id SET DEFAULT nextval('dbo.au_auction_event_supp_mapping_id_seq'::regclass);
    ALTER SEQUENCE dbo.au_auction_event_supp_mapping_id_seq
      OWNED BY dbo.au_auction_event_supp_mapping.id;
    RAISE NOTICE 'au_auction_event_supp_mapping.id DEFAULT bound';
  END IF;
END $$;

-- dbo.au_auction_event_supp_wise_cap (explicit nextval in service: au_auction_event_supp_wise_cap_id_seq)
CREATE SEQUENCE IF NOT EXISTS dbo.au_auction_event_supp_wise_cap_id_seq;
DO $$
DECLARE
  _setv BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dbo' AND table_name = 'au_auction_event_supp_wise_cap'
  ) THEN
    RETURN;
  END IF;
  SELECT setval(
    'dbo.au_auction_event_supp_wise_cap_id_seq'::regclass,
    GREATEST(COALESCE((SELECT MAX(id) FROM dbo.au_auction_event_supp_wise_cap), 0), 1),
    (SELECT MAX(id) FROM dbo.au_auction_event_supp_wise_cap) IS NOT NULL
  ) INTO _setv;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'dbo' AND c.table_name = 'au_auction_event_supp_wise_cap'
      AND c.column_name = 'id' AND COALESCE(c.is_identity, 'NO') <> 'YES'
      AND (c.column_default IS NULL OR c.column_default NOT ILIKE '%nextval%')
  ) THEN
    ALTER TABLE dbo.au_auction_event_supp_wise_cap
      ALTER COLUMN id SET DEFAULT nextval('dbo.au_auction_event_supp_wise_cap_id_seq'::regclass);
    ALTER SEQUENCE dbo.au_auction_event_supp_wise_cap_id_seq
      OWNED BY dbo.au_auction_event_supp_wise_cap.id;
    RAISE NOTICE 'au_auction_event_supp_wise_cap.id DEFAULT bound';
  END IF;
END $$;

-- dbo.au_auction_event_tnc_mapping
CREATE SEQUENCE IF NOT EXISTS dbo.au_auction_event_tnc_mapping_id_seq;
DO $$
DECLARE
  _setv BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dbo' AND table_name = 'au_auction_event_tnc_mapping'
  ) THEN
    RETURN;
  END IF;
  SELECT setval(
    'dbo.au_auction_event_tnc_mapping_id_seq'::regclass,
    GREATEST(COALESCE((SELECT MAX(id) FROM dbo.au_auction_event_tnc_mapping), 0), 1),
    (SELECT MAX(id) FROM dbo.au_auction_event_tnc_mapping) IS NOT NULL
  ) INTO _setv;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'dbo' AND c.table_name = 'au_auction_event_tnc_mapping'
      AND c.column_name = 'id' AND COALESCE(c.is_identity, 'NO') <> 'YES'
      AND (c.column_default IS NULL OR c.column_default NOT ILIKE '%nextval%')
  ) THEN
    ALTER TABLE dbo.au_auction_event_tnc_mapping
      ALTER COLUMN id SET DEFAULT nextval('dbo.au_auction_event_tnc_mapping_id_seq'::regclass);
    ALTER SEQUENCE dbo.au_auction_event_tnc_mapping_id_seq
      OWNED BY dbo.au_auction_event_tnc_mapping.id;
    RAISE NOTICE 'au_auction_event_tnc_mapping.id DEFAULT bound';
  END IF;
END $$;

-- dbo.au_auction_broadcast_message (service uses dbo.au_auction_broadcast_message_id_seq for inserts)
CREATE SEQUENCE IF NOT EXISTS dbo.au_auction_broadcast_message_id_seq;
DO $$
DECLARE
  _setv BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dbo' AND table_name = 'au_auction_broadcast_message'
  ) THEN
    RETURN;
  END IF;
  SELECT setval(
    'dbo.au_auction_broadcast_message_id_seq'::regclass,
    GREATEST(COALESCE((SELECT MAX(id) FROM dbo.au_auction_broadcast_message), 0), 1),
    (SELECT MAX(id) FROM dbo.au_auction_broadcast_message) IS NOT NULL
  ) INTO _setv;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'dbo' AND c.table_name = 'au_auction_broadcast_message'
      AND c.column_name = 'id' AND COALESCE(c.is_identity, 'NO') <> 'YES'
      AND (c.column_default IS NULL OR c.column_default NOT ILIKE '%nextval%')
  ) THEN
    ALTER TABLE dbo.au_auction_broadcast_message
      ALTER COLUMN id SET DEFAULT nextval('dbo.au_auction_broadcast_message_id_seq'::regclass);
    ALTER SEQUENCE dbo.au_auction_broadcast_message_id_seq
      OWNED BY dbo.au_auction_broadcast_message.id;
    RAISE NOTICE 'au_auction_broadcast_message.id DEFAULT bound';
  END IF;
END $$;

-- dbo.au_auction_supp_award_event (ensureAuctionAwardInsertSequences)
CREATE SEQUENCE IF NOT EXISTS dbo.au_auction_supp_award_event_id_seq;
DO $$
DECLARE
  _setv BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dbo' AND table_name = 'au_auction_supp_award_event'
  ) THEN
    RETURN;
  END IF;
  SELECT setval(
    'dbo.au_auction_supp_award_event_id_seq'::regclass,
    GREATEST(COALESCE((SELECT MAX(id) FROM dbo.au_auction_supp_award_event), 0), 1),
    (SELECT MAX(id) FROM dbo.au_auction_supp_award_event) IS NOT NULL
  ) INTO _setv;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'dbo' AND c.table_name = 'au_auction_supp_award_event'
      AND c.column_name = 'id' AND COALESCE(c.is_identity, 'NO') <> 'YES'
      AND (c.column_default IS NULL OR c.column_default NOT ILIKE '%nextval%')
  ) THEN
    ALTER TABLE dbo.au_auction_supp_award_event
      ALTER COLUMN id SET DEFAULT nextval('dbo.au_auction_supp_award_event_id_seq'::regclass);
    ALTER SEQUENCE dbo.au_auction_supp_award_event_id_seq
      OWNED BY dbo.au_auction_supp_award_event.id;
    RAISE NOTICE 'au_auction_supp_award_event.id DEFAULT bound';
  END IF;
END $$;

-- dbo.au_auction_supp_award_event_row
CREATE SEQUENCE IF NOT EXISTS dbo.au_auction_supp_award_event_row_id_seq;
DO $$
DECLARE
  _setv BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dbo' AND table_name = 'au_auction_supp_award_event_row'
  ) THEN
    RETURN;
  END IF;
  SELECT setval(
    'dbo.au_auction_supp_award_event_row_id_seq'::regclass,
    GREATEST(COALESCE((SELECT MAX(id) FROM dbo.au_auction_supp_award_event_row), 0), 1),
    (SELECT MAX(id) FROM dbo.au_auction_supp_award_event_row) IS NOT NULL
  ) INTO _setv;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'dbo' AND c.table_name = 'au_auction_supp_award_event_row'
      AND c.column_name = 'id' AND COALESCE(c.is_identity, 'NO') <> 'YES'
      AND (c.column_default IS NULL OR c.column_default NOT ILIKE '%nextval%')
  ) THEN
    ALTER TABLE dbo.au_auction_supp_award_event_row
      ALTER COLUMN id SET DEFAULT nextval('dbo.au_auction_supp_award_event_row_id_seq'::regclass);
    ALTER SEQUENCE dbo.au_auction_supp_award_event_row_id_seq
      OWNED BY dbo.au_auction_supp_award_event_row.id;
    RAISE NOTICE 'au_auction_supp_award_event_row.id DEFAULT bound';
  END IF;
END $$;

-- dbo.au_auction_supp_award_event_template_column_values
CREATE SEQUENCE IF NOT EXISTS dbo.au_auction_supp_award_event_template_column_values_id_seq;
DO $$
DECLARE
  _setv BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dbo' AND table_name = 'au_auction_supp_award_event_template_column_values'
  ) THEN
    RETURN;
  END IF;
  SELECT setval(
    'dbo.au_auction_supp_award_event_template_column_values_id_seq'::regclass,
    GREATEST(COALESCE((SELECT MAX(id) FROM dbo.au_auction_supp_award_event_template_column_values), 0), 1),
    (SELECT MAX(id) FROM dbo.au_auction_supp_award_event_template_column_values) IS NOT NULL
  ) INTO _setv;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'dbo' AND c.table_name = 'au_auction_supp_award_event_template_column_values'
      AND c.column_name = 'id' AND COALESCE(c.is_identity, 'NO') <> 'YES'
      AND (c.column_default IS NULL OR c.column_default NOT ILIKE '%nextval%')
  ) THEN
    ALTER TABLE dbo.au_auction_supp_award_event_template_column_values
      ALTER COLUMN id SET DEFAULT nextval('dbo.au_auction_supp_award_event_template_column_values_id_seq'::regclass);
    ALTER SEQUENCE dbo.au_auction_supp_award_event_template_column_values_id_seq
      OWNED BY dbo.au_auction_supp_award_event_template_column_values.id;
    RAISE NOTICE 'au_auction_supp_award_event_template_column_values.id DEFAULT bound';
  END IF;
END $$;

-- dbo.au_auction_supp_event_response
CREATE SEQUENCE IF NOT EXISTS dbo.au_auction_supp_event_response_id_seq;
DO $$
DECLARE
  _setv BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dbo' AND table_name = 'au_auction_supp_event_response'
  ) THEN
    RETURN;
  END IF;
  SELECT setval(
    'dbo.au_auction_supp_event_response_id_seq'::regclass,
    GREATEST(COALESCE((SELECT MAX(id) FROM dbo.au_auction_supp_event_response), 0), 1),
    (SELECT MAX(id) FROM dbo.au_auction_supp_event_response) IS NOT NULL
  ) INTO _setv;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'dbo' AND c.table_name = 'au_auction_supp_event_response'
      AND c.column_name = 'id' AND COALESCE(c.is_identity, 'NO') <> 'YES'
      AND (c.column_default IS NULL OR c.column_default NOT ILIKE '%nextval%')
  ) THEN
    ALTER TABLE dbo.au_auction_supp_event_response
      ALTER COLUMN id SET DEFAULT nextval('dbo.au_auction_supp_event_response_id_seq'::regclass);
    ALTER SEQUENCE dbo.au_auction_supp_event_response_id_seq
      OWNED BY dbo.au_auction_supp_event_response.id;
    RAISE NOTICE 'au_auction_supp_event_response.id DEFAULT bound';
  END IF;
END $$;

-- dbo.au_auction_supp_event_response_row
CREATE SEQUENCE IF NOT EXISTS dbo.au_auction_supp_event_response_row_id_seq;
DO $$
DECLARE
  _setv BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dbo' AND table_name = 'au_auction_supp_event_response_row'
  ) THEN
    RETURN;
  END IF;
  SELECT setval(
    'dbo.au_auction_supp_event_response_row_id_seq'::regclass,
    GREATEST(COALESCE((SELECT MAX(id) FROM dbo.au_auction_supp_event_response_row), 0), 1),
    (SELECT MAX(id) FROM dbo.au_auction_supp_event_response_row) IS NOT NULL
  ) INTO _setv;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'dbo' AND c.table_name = 'au_auction_supp_event_response_row'
      AND c.column_name = 'id' AND COALESCE(c.is_identity, 'NO') <> 'YES'
      AND (c.column_default IS NULL OR c.column_default NOT ILIKE '%nextval%')
  ) THEN
    ALTER TABLE dbo.au_auction_supp_event_response_row
      ALTER COLUMN id SET DEFAULT nextval('dbo.au_auction_supp_event_response_row_id_seq'::regclass);
    ALTER SEQUENCE dbo.au_auction_supp_event_response_row_id_seq
      OWNED BY dbo.au_auction_supp_event_response_row.id;
    RAISE NOTICE 'au_auction_supp_event_response_row.id DEFAULT bound';
  END IF;
END $$;

-- dbo.au_auction_supp_event_response_template_column_values
CREATE SEQUENCE IF NOT EXISTS dbo.au_auction_supp_event_response_template_column_values_id_seq;
DO $$
DECLARE
  _setv BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dbo' AND table_name = 'au_auction_supp_event_response_template_column_values'
  ) THEN
    RETURN;
  END IF;
  SELECT setval(
    'dbo.au_auction_supp_event_response_template_column_values_id_seq'::regclass,
    GREATEST(COALESCE((SELECT MAX(id) FROM dbo.au_auction_supp_event_response_template_column_values), 0), 1),
    (SELECT MAX(id) FROM dbo.au_auction_supp_event_response_template_column_values) IS NOT NULL
  ) INTO _setv;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'dbo' AND c.table_name = 'au_auction_supp_event_response_template_column_values'
      AND c.column_name = 'id' AND COALESCE(c.is_identity, 'NO') <> 'YES'
      AND (c.column_default IS NULL OR c.column_default NOT ILIKE '%nextval%')
  ) THEN
    ALTER TABLE dbo.au_auction_supp_event_response_template_column_values
      ALTER COLUMN id SET DEFAULT nextval('dbo.au_auction_supp_event_response_template_column_values_id_seq'::regclass);
    ALTER SEQUENCE dbo.au_auction_supp_event_response_template_column_values_id_seq
      OWNED BY dbo.au_auction_supp_event_response_template_column_values.id;
    RAISE NOTICE 'au_auction_supp_event_response_template_column_values.id DEFAULT bound';
  END IF;
END $$;

-- dbo.au_auction_supp_event_response_history (optional — some DBs omit history tables)
CREATE SEQUENCE IF NOT EXISTS dbo.au_auction_supp_event_response_history_id_seq;
DO $$
DECLARE
  _setv BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dbo' AND table_name = 'au_auction_supp_event_response_history'
  ) THEN
    RETURN;
  END IF;
  SELECT setval(
    'dbo.au_auction_supp_event_response_history_id_seq'::regclass,
    GREATEST(COALESCE((SELECT MAX(id) FROM dbo.au_auction_supp_event_response_history), 0), 1),
    (SELECT MAX(id) FROM dbo.au_auction_supp_event_response_history) IS NOT NULL
  ) INTO _setv;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'dbo' AND c.table_name = 'au_auction_supp_event_response_history'
      AND c.column_name = 'id' AND COALESCE(c.is_identity, 'NO') <> 'YES'
      AND (c.column_default IS NULL OR c.column_default NOT ILIKE '%nextval%')
  ) THEN
    ALTER TABLE dbo.au_auction_supp_event_response_history
      ALTER COLUMN id SET DEFAULT nextval('dbo.au_auction_supp_event_response_history_id_seq'::regclass);
    ALTER SEQUENCE dbo.au_auction_supp_event_response_history_id_seq
      OWNED BY dbo.au_auction_supp_event_response_history.id;
    RAISE NOTICE 'au_auction_supp_event_response_history.id DEFAULT bound';
  END IF;
END $$;

-- dbo.au_auction_supp_event_response_row_history
CREATE SEQUENCE IF NOT EXISTS dbo.au_auction_supp_event_response_row_history_id_seq;
DO $$
DECLARE
  _setv BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dbo' AND table_name = 'au_auction_supp_event_response_row_history'
  ) THEN
    RETURN;
  END IF;
  SELECT setval(
    'dbo.au_auction_supp_event_response_row_history_id_seq'::regclass,
    GREATEST(COALESCE((SELECT MAX(id) FROM dbo.au_auction_supp_event_response_row_history), 0), 1),
    (SELECT MAX(id) FROM dbo.au_auction_supp_event_response_row_history) IS NOT NULL
  ) INTO _setv;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'dbo' AND c.table_name = 'au_auction_supp_event_response_row_history'
      AND c.column_name = 'id' AND COALESCE(c.is_identity, 'NO') <> 'YES'
      AND (c.column_default IS NULL OR c.column_default NOT ILIKE '%nextval%')
  ) THEN
    ALTER TABLE dbo.au_auction_supp_event_response_row_history
      ALTER COLUMN id SET DEFAULT nextval('dbo.au_auction_supp_event_response_row_history_id_seq'::regclass);
    ALTER SEQUENCE dbo.au_auction_supp_event_response_row_history_id_seq
      OWNED BY dbo.au_auction_supp_event_response_row_history.id;
    RAISE NOTICE 'au_auction_supp_event_response_row_history.id DEFAULT bound';
  END IF;
END $$;

-- dbo.au_auction_supp_event_response_template_column_values_history
CREATE SEQUENCE IF NOT EXISTS dbo.au_auction_supp_event_response_template_column_values_history_id_seq;
DO $$
DECLARE
  _setv BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dbo' AND table_name = 'au_auction_supp_event_response_template_column_values_history'
  ) THEN
    RETURN;
  END IF;
  SELECT setval(
    'dbo.au_auction_supp_event_response_template_column_values_history_id_seq'::regclass,
    GREATEST(COALESCE((SELECT MAX(id) FROM dbo.au_auction_supp_event_response_template_column_values_history), 0), 1),
    (SELECT MAX(id) FROM dbo.au_auction_supp_event_response_template_column_values_history) IS NOT NULL
  ) INTO _setv;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'dbo' AND c.table_name = 'au_auction_supp_event_response_template_column_values_history'
      AND c.column_name = 'id' AND COALESCE(c.is_identity, 'NO') <> 'YES'
      AND (c.column_default IS NULL OR c.column_default NOT ILIKE '%nextval%')
  ) THEN
    ALTER TABLE dbo.au_auction_supp_event_response_template_column_values_history
      ALTER COLUMN id SET DEFAULT nextval('dbo.au_auction_supp_event_response_template_column_values_history_id_seq'::regclass);
    ALTER SEQUENCE dbo.au_auction_supp_event_response_template_column_values_history_id_seq
      OWNED BY dbo.au_auction_supp_event_response_template_column_values_history.id;
    RAISE NOTICE 'au_auction_supp_event_response_template_column_values_history.id DEFAULT bound';
  END IF;
END $$;

-- =============================================================================
-- Done. Apply this file when provisioning DBs or after pulls that add auction DDL.
-- =============================================================================
