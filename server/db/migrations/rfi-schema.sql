-- RFI (Request for Information) module tables.
--
-- Manual DDL — NOT tracked by drizzle-kit (this codebase has no active
-- generated-migration workflow; contracts/bids/invoices tables are managed
-- the same way). Run this against EVERY tenant database (each tenant has its
-- own Postgres database per server/tenant-db.ts), not just the master DB.
--
--   psql "<tenant-db-connection-string>" -f db/rfi-schema.sql

CREATE TABLE IF NOT EXISTS dbo.rfi_campaigns (
  id                      SERIAL PRIMARY KEY,
  campaign_code           VARCHAR(20) UNIQUE,
  title                   VARCHAR(255) NOT NULL,
  description             TEXT NOT NULL,
  status                  VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft | published | closed
  deadline                DATE NOT NULL,
  source_pr_number        VARCHAR(50), -- soft reference to dbo.supp_pr_header_dtls.pr_number
  created_by              VARCHAR(255),
  creation_time           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_modified_by        VARCHAR(255),
  last_modification_time  TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_time          TIMESTAMPTZ,
  closed_time             TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS dbo.rfi_campaign_suppliers (
  id                      SERIAL PRIMARY KEY,
  campaign_id             INTEGER NOT NULL REFERENCES dbo.rfi_campaigns(id) ON DELETE CASCADE,
  supplier_id             VARCHAR(50) NOT NULL,
  supplier_name           VARCHAR(255),
  supplier_email          VARCHAR(255),
  supplier_contact        VARCHAR(255),
  status                  VARCHAR(20) NOT NULL DEFAULT 'invited', -- invited | responded
  is_shortlisted          BOOLEAN NOT NULL DEFAULT false,
  created_by              VARCHAR(255),
  creation_time           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_modified_by        VARCHAR(255),
  last_modification_time  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, supplier_id)
);

CREATE TABLE IF NOT EXISTS dbo.rfi_questions_dtls (
  id                      SERIAL PRIMARY KEY,
  campaign_id             INTEGER NOT NULL REFERENCES dbo.rfi_campaigns(id) ON DELETE CASCADE,
  library_id              VARCHAR(20), -- e.g. "LIB-01", when copied from the static catalog
  attribute_key           VARCHAR(100),
  question_text           TEXT NOT NULL,
  question_type           VARCHAR(20) NOT NULL, -- text | single_select | multi_select | number | date | file_upload
  options                 JSONB,
  required                BOOLEAN NOT NULL DEFAULT false,
  source                  VARCHAR(10) NOT NULL DEFAULT 'custom', -- library | custom
  display_order           INTEGER NOT NULL DEFAULT 0,
  created_by              VARCHAR(255),
  creation_time           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dbo.rfi_responses_dtls (
  id                      SERIAL PRIMARY KEY,
  campaign_id             INTEGER NOT NULL REFERENCES dbo.rfi_campaigns(id) ON DELETE CASCADE,
  supplier_id             VARCHAR(50) NOT NULL,
  question_id             INTEGER NOT NULL REFERENCES dbo.rfi_questions_dtls(id) ON DELETE CASCADE,
  answer_value            TEXT, -- JSON-encoded for multi_select arrays / file metadata, plain text otherwise
  submitted_by            VARCHAR(255),
  submitted_time          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              VARCHAR(255),
  creation_time           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_modified_by        VARCHAR(255),
  last_modification_time  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, supplier_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_rfi_campaign_suppliers_campaign ON dbo.rfi_campaign_suppliers(campaign_id);
CREATE INDEX IF NOT EXISTS idx_rfi_questions_campaign ON dbo.rfi_questions_dtls(campaign_id);
CREATE INDEX IF NOT EXISTS idx_rfi_responses_campaign ON dbo.rfi_responses_dtls(campaign_id);
CREATE INDEX IF NOT EXISTS idx_rfi_responses_supplier ON dbo.rfi_responses_dtls(campaign_id, supplier_id);

-- Optional ops step: seed a menu entry so /app/rfi shows up in the sidebar and
-- passes client/src/components/protected-route.tsx's access check.
--
-- Verified against the real seed data in scripts/migrate-prokraya-v2.sql:
--   - module_name 'Modules' groups it under the same sidebar section as
--     Bids/Contracts/Purchase Requests/Invoices/Purchase Orders.
--   - category 'PRIVATE_COMMON' matches those same internal-staff modules
--     (not 'ADMIN'-only, not 'SUPPLIER_ADMIN').
--   - The icon actually rendered comes from app-sidebar.tsx's iconMap, keyed
--     by function_name (already added: "RFI_CAMPAIGNS" -> ClipboardList) —
--     the icon_name column below is legacy/unused by the current UI, kept
--     only for consistency with existing rows.
--
-- First check `id` 20001 isn't already taken in this tenant's DB:
--   SELECT id FROM dbo.um_functions_dtls WHERE id = 20001;
-- If it is, pick a free id (e.g. run `SELECT MAX(id) FROM dbo.um_functions_dtls;`
-- and use max + 1) and update both statements below to match.

INSERT INTO dbo.um_functions_dtls (id, function_name, description, module_name, function_url, category, icon_name, status)
VALUES (20001, 'RFI_CAMPAIGNS', 'RFI Campaigns', 'Modules', '/app/rfi', 'PRIVATE_COMMON', 'requisition-new', 1);

-- Grants RFI to the same roles that already see Bids (function id 145):
-- Super Admin, End User, Procurement Manager, Finance Officer, Procurement Officer.
-- Add/remove role ids below to match who you actually want to see it —
-- role ids are tenant-seeded (100=Super Admin, 101=End User, 103=Supplier Admin,
-- 104=Procurement Manager, 105=Finance Officer, 106=Finance Manager,
-- 107=Procurement Officer, 108=Department User per migrate-prokraya-v2.sql;
-- confirm against dbo.um_role_dtls in this tenant before running, roles may differ).
INSERT INTO dbo.um_role_functions_map_dtls (role_id, function_id, created_by, creation_date)
VALUES
  (100, 20001, 'system', NOW()),  -- Super Admin
  (101, 20001, 'system', NOW()),  -- End User
  (104, 20001, 'system', NOW()),  -- Procurement Manager
  (105, 20001, 'system', NOW()),  -- Finance Officer
  (107, 20001, 'system', NOW());  -- Procurement Officer
-- Vendor (supplier) menu entry — mirrors SUPP_BIDS_WORKBENCH (id 10173) exactly.
INSERT INTO dbo.um_functions_dtls (id, function_name, description, module_name, function_url, category, icon_name, status)
VALUES (20002, 'SUPP_RFI_WORKBENCH', 'RFI', 'Modules', '/app/supp-rfi', 'SUPPLIER_ADMIN', 'sd_bids', 1);

-- Grants vendor RFI to the same role SUPP_BIDS_WORKBENCH is mapped to (Supplier Admin).
-- If this tenant also has a separate "Supplier User" role that should see it, add its id too.
INSERT INTO dbo.um_role_functions_map_dtls (role_id, function_id, created_by, creation_date)
VALUES (103, 20002, 'system', NOW());  -- Supplier Admin
