-- Migration: Change supp_bid_response_dtls.id from INTEGER to 5-digit zero-padded VARCHAR(10)
-- Also updates all FK columns in child tables that reference this ID.

-- Step 1: Create sequence for new bid response IDs
CREATE SEQUENCE IF NOT EXISTS dbo.supp_bid_response_dtls_id_seq;

-- Step 2: Drop FK constraints on child tables before type conversion
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tc.constraint_name, tc.table_schema, tc.table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name AND tc.constraint_schema = rc.constraint_schema
    JOIN information_schema.table_constraints pc
      ON rc.unique_constraint_name = pc.constraint_name AND rc.unique_constraint_schema = pc.constraint_schema
    WHERE pc.table_name = 'supp_bid_response_dtls'
      AND pc.table_schema = 'dbo'
      AND tc.constraint_type = 'FOREIGN KEY'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',
      r.table_schema, r.table_name, r.constraint_name);
  END LOOP;
END $$;

-- Step 3: Convert primary key column to VARCHAR(10) with zero-padded values first
ALTER TABLE dbo.supp_bid_response_dtls
  ALTER COLUMN id TYPE VARCHAR(10) USING LPAD(id::text, 5, '0');

-- Step 4: Sync sequence to current max ID (runs after PK conversion so cast is safe)
DO $$
DECLARE
  max_id bigint;
BEGIN
  SELECT COALESCE(MAX(id::bigint), 0) INTO max_id FROM dbo.supp_bid_response_dtls;
  PERFORM setval('dbo.supp_bid_response_dtls_id_seq', GREATEST(max_id, 1), true);
END $$;

-- Step 5: Convert FK columns in child tables to VARCHAR(10) with zero-padded values
ALTER TABLE dbo.supp_bid_response_reqmnt_dtls
  ALTER COLUMN bid_resp_id TYPE VARCHAR(10) USING LPAD(bid_resp_id::text, 5, '0');

ALTER TABLE dbo.supp_bid_response_line_dtls
  ALTER COLUMN bid_resp_id TYPE VARCHAR(10) USING LPAD(bid_resp_id::text, 5, '0');

ALTER TABLE dbo.supp_bid_response_reqmnt_score_dtls
  ALTER COLUMN bid_resp_id TYPE VARCHAR(10) USING LPAD(bid_resp_id::text, 5, '0');

ALTER TABLE dbo.supp_bid_award_dtls
  ALTER COLUMN bid_resp_no TYPE VARCHAR(10)
  USING CASE WHEN bid_resp_no IS NOT NULL THEN LPAD(bid_resp_no::text, 5, '0') ELSE NULL END;

-- Step 6: Re-add FK constraints
ALTER TABLE dbo.supp_bid_response_reqmnt_dtls
  ADD CONSTRAINT fk_bid_resp_reqmnt_resp_id
  FOREIGN KEY (bid_resp_id) REFERENCES dbo.supp_bid_response_dtls(id);

ALTER TABLE dbo.supp_bid_response_line_dtls
  ADD CONSTRAINT fk_bid_resp_line_resp_id
  FOREIGN KEY (bid_resp_id) REFERENCES dbo.supp_bid_response_dtls(id);

ALTER TABLE dbo.supp_bid_response_reqmnt_score_dtls
  ADD CONSTRAINT fk_bid_resp_score_resp_id
  FOREIGN KEY (bid_resp_id) REFERENCES dbo.supp_bid_response_dtls(id);
