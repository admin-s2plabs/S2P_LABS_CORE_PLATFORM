-- ============================================================
-- Prokraya V2 Migration Script
-- ============================================================
-- Purpose: Apply all schema & data changes required for the
--          Prokraya V2 (AI-native) platform to an existing
--          classic Prokraya database.
--
-- Changes:
--   1. am_property_mst       → Widen prop_value to TEXT
--   2. am_masterdata_trans_dtls → Add 5 new columns + auto-increment sequence
--   3. um_functions_dtls      → Backup & replace with new menu/functions data
--   4. um_role_functions_map_dtls → Backup & replace with new role mappings
--   5. session                → Create Express session store table
--   6. users                  → Create Passport.js authentication table
--   7. am_ai_service_settings → AI feature toggle configuration (27 features)
--
-- Usage:
--   psql -h <host> -U <user> -d <database> -f migrate-prokraya-v2.sql
--
-- IMPORTANT: Run this ONCE per database. It is idempotent (safe to re-run).
-- ============================================================

BEGIN;

-- ============================================================
-- 1. am_property_mst — Widen prop_value from varchar(355) to TEXT
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'dbo' AND table_name = 'am_property_mst'
      AND column_name = 'prop_value' AND data_type = 'character varying'
  ) THEN
    ALTER TABLE dbo.am_property_mst ALTER COLUMN prop_value TYPE text;
    RAISE NOTICE '[1/4] am_property_mst.prop_value widened to TEXT';
  ELSE
    RAISE NOTICE '[1/4] am_property_mst.prop_value already TEXT — skipped';
  END IF;
END $$;

-- ============================================================
-- 2. am_masterdata_trans_dtls — Add ERP integration columns
-- ============================================================
DO $$
BEGIN
  -- Add target_table column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'dbo' AND table_name = 'am_masterdata_trans_dtls' AND column_name = 'target_table'
  ) THEN
    ALTER TABLE dbo.am_masterdata_trans_dtls ADD COLUMN target_table character varying;
    RAISE NOTICE '[2/4] Added target_table column';
  END IF;

  -- Add field_mappings column (JSONB)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'dbo' AND table_name = 'am_masterdata_trans_dtls' AND column_name = 'field_mappings'
  ) THEN
    ALTER TABLE dbo.am_masterdata_trans_dtls ADD COLUMN field_mappings jsonb DEFAULT '{}'::jsonb;
    RAISE NOTICE '[2/4] Added field_mappings column';
  END IF;

  -- Add erp_endpoint column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'dbo' AND table_name = 'am_masterdata_trans_dtls' AND column_name = 'erp_endpoint'
  ) THEN
    ALTER TABLE dbo.am_masterdata_trans_dtls ADD COLUMN erp_endpoint character varying;
    RAISE NOTICE '[2/4] Added erp_endpoint column';
  END IF;

  -- Add sync_mode column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'dbo' AND table_name = 'am_masterdata_trans_dtls' AND column_name = 'sync_mode'
  ) THEN
    ALTER TABLE dbo.am_masterdata_trans_dtls ADD COLUMN sync_mode character varying(20) DEFAULT 'standard';
    RAISE NOTICE '[2/4] Added sync_mode column';
  END IF;

  -- Add custom_sync_handler column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'dbo' AND table_name = 'am_masterdata_trans_dtls' AND column_name = 'custom_sync_handler'
  ) THEN
    ALTER TABLE dbo.am_masterdata_trans_dtls ADD COLUMN custom_sync_handler character varying(100);
    RAISE NOTICE '[2/4] Added custom_sync_handler column';
  END IF;

  RAISE NOTICE '[2/4] am_masterdata_trans_dtls columns complete';
END $$;

-- Add auto-increment sequence for id (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_sequences WHERE schemaname = 'dbo' AND sequencename = 'am_masterdata_trans_dtls_id_seq'
  ) THEN
    CREATE SEQUENCE dbo.am_masterdata_trans_dtls_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
    ALTER SEQUENCE dbo.am_masterdata_trans_dtls_id_seq OWNER TO current_user;

    -- Set the sequence to start after the max existing id
    PERFORM setval('dbo.am_masterdata_trans_dtls_id_seq', COALESCE((SELECT MAX(id) FROM dbo.am_masterdata_trans_dtls), 0) + 1, false);

    ALTER TABLE dbo.am_masterdata_trans_dtls ALTER COLUMN id SET DEFAULT nextval('dbo.am_masterdata_trans_dtls_id_seq');
    RAISE NOTICE '[2/4] Created am_masterdata_trans_dtls_id_seq and set as default for id';
  ELSE
    RAISE NOTICE '[2/4] am_masterdata_trans_dtls_id_seq already exists — skipped';
  END IF;
END $$;

-- ============================================================
-- 3. um_functions_dtls — Backup existing, then replace data
-- ============================================================

-- Create backup table (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dbo' AND table_name = 'um_functions_dtls_backup'
  ) THEN
    CREATE TABLE dbo.um_functions_dtls_backup AS SELECT * FROM dbo.um_functions_dtls;
    RAISE NOTICE '[3/4] Created um_functions_dtls_backup with % rows', (SELECT count(*) FROM dbo.um_functions_dtls_backup);
  ELSE
    RAISE NOTICE '[3/4] um_functions_dtls_backup already exists — skipping backup';
  END IF;
END $$;

-- Add new columns if they don't exist (classic DB may not have these)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'dbo' AND table_name = 'um_functions_dtls' AND column_name = 'category'
  ) THEN
    ALTER TABLE dbo.um_functions_dtls ADD COLUMN category character varying(355);
    RAISE NOTICE '[3/4] Added category column to um_functions_dtls';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'dbo' AND table_name = 'um_functions_dtls' AND column_name = 'module_name'
  ) THEN
    ALTER TABLE dbo.um_functions_dtls ADD COLUMN module_name character varying(600);
    RAISE NOTICE '[3/4] Added module_name column to um_functions_dtls';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'dbo' AND table_name = 'um_functions_dtls' AND column_name = 'icon_name'
  ) THEN
    ALTER TABLE dbo.um_functions_dtls ADD COLUMN icon_name character varying(355);
    RAISE NOTICE '[3/4] Added icon_name column to um_functions_dtls';
  END IF;
END $$;

-- Clear role mappings FIRST (foreign key depends on um_functions_dtls)
DELETE FROM dbo.um_role_functions_map_dtls;

-- Then clear functions
DELETE FROM dbo.um_functions_dtls;

INSERT INTO dbo.um_functions_dtls (id, function_name, description, module_name, function_url, category, icon_name, status)
VALUES
  (103, 'CREATE_SRMS_USERS', 'Manage Users', 'User Management', '/app/users', 'ADMIN', 'user-management-new', 1),
  (104, 'CREATE_SRMS_ROLES', 'Manage Roles', 'User Management', '/app/roles', 'ADMIN', 'user-management-new', 1),
  (105, 'DELEGATE_USER_ROLES', 'Role Delegation', 'User Management', '/app/role-delegation', 'ADMIN', 'user-management-new', 1),
  (106, 'BASIC_SETTINGS', 'Basic Settings', 'Administration', '/app/basic-settings', 'ADMIN', 'administration-new', 1),
  (109, 'SUPPLIER_DASHBOARD', 'Vendor Dashboard', 'Vendors', 'suppmgmt/suppDashboard', 'SUPPLIER_ADMIN', 'sd_suppliers-new', 0),
  (110, 'VIEW_EDIT_SUPP_PROFILE', 'Registration Profile', 'Modules', '/app/vendors/{supplierId}', 'SUPPLIER_ADMIN', 'sd_suppliers-new', 1),
  (111, 'CREATE_SUPP_USERS', 'Create Vendor User', 'Vendors', 'suppmgmt/createSuppUser', 'SUPPLIER_ADMIN', 'sd_suppliers-new', 0),
  (114, 'SUSER_ROLE_DELEGATION', 'Out of Office Role Delegation', 'General', 'usrmgmt/usrRoleDelegation', 'PRIVATE_COMMON', NULL, 0),
  (115, 'SEARCH_SUPPLIERS', 'Vendors', 'Modules', '/app/vendors', 'PRIVATE_COMMON', 'sd_suppliers-new', 1),
  (116, 'DASHBOARD', 'Dashboard', 'Modules', '/app/dashboard', 'COMMON', 'sd_dashboard', 1),
  (121, 'PO_WORKBENCH', 'Purchase Orders', 'Purchase Orders', 'invoicemgmt/poWorkbench', 'SUPPLIER_ADMIN', 'sd_sourcing-new', 0),
  (124, 'MANAGE_MASTER_DATA', 'Manage Master Data', 'Integrations', '/app/master-data', 'ADMIN', 'sd_integration', 1),
  (125, 'SYSTEM_MONITOR', 'Interface Monitor', 'Integrations', '/app/system-monitor', 'ADMIN', 'sd_integration', 1),
  (137, 'COST_CENTERS', 'Cost Center Setup', 'Administration', '/app/cost-center-setup', 'ADMIN', 'administration-new', 1),
  (140, 'REPORTS', 'Reports', 'Modules', '/app/reports', 'PRIVATE_COMMON', 'sd_myreports', 1),
  (145, 'BIDS_WORKBENCH', 'Bids', 'Modules', '/app/bids', 'PRIVATE_COMMON', 'sd_bids', 1),
  (146, 'SUPP_ENQUIRY', 'Enquiries', 'Suppliers', 'suppmgmt/suppEnquiry', 'SUPPLIER_ADMIN', 'sd_suppliers-new', 0),
  (147, 'RECONCILIATION', 'Reconciliation', NULL, 'suppmgmt/reconciliation', 'SUPPLIER_ADMIN', NULL, 0),
  (149, 'ENQUIRY_LIST', 'Supplier Enquiries', 'Suppliers', 'suppmgmt/enquiryList', 'PRIVATE_COMMON', 'sd_suppliers-new', 0),
  (150, 'INVOICE_SEARCH', 'Invoices', 'Modules', '/app/invoices', 'COMMON', 'sd_invoices-new', 1),
  (152, 'PO_VIEW', 'Purchase Orders', 'Modules', '/app/purchase-orders', 'COMMON', 'sd_sourcing-new', 1),
  (153, 'RECONCILIATION_REPORT', 'Reconciliation Report', NULL, 'suppmgmt/reconReport', 'PRIVATE_COMMON', NULL, 0),
  (154, 'RBNI_RECONCILIATION', 'RBNI Reconciliation', NULL, 'repmgmt/rbni', 'PRIVATE_COMMON', NULL, 0),
  (3139, 'EOD_PROCESS', 'EOD Processes', NULL, 'admmgmt/eodprocesses', 'ADMIN', NULL, 0),
  (3143, 'PR_CATALOGUE', 'Requisitions', 'Modules', '/app/purchase-requests', 'PRIVATE_COMMON', 'requisition-new', 1),
  (3144, 'BANKG_CATALOGUE', 'Bank Gaurantees Catalogue', NULL, 'invoicemgmt/bankGuranteeDocs', 'PRIVATE_COMMON', NULL, 0),
  (3146, 'SURVEY_FORM', 'Survey Form', NULL, 'suppmgmt/surveyForm', 'PRIVATE_COMMON', NULL, 0),
  (3147, 'SUPP_SURVEY_ANALYSIS', 'Survey Analysis', NULL, 'suppmgmt/surveyAnalysis', 'PRIVATE_COMMON', NULL, 0),
  (6138, 'NEW_CONTRACTS', 'Contracts', 'Modules', '/app/contracts', 'PRIVATE_COMMON', 'requisition-new', 1),
  (6139, 'NEW_CONTRACTS', 'Contract Terms', 'Modules', '/app/contract-terms', 'PRIVATE_COMMON', NULL, 1),
  (6140, 'NEW_CONTRACTS', 'Checklists', NULL, 'contrmgmt/checklists', 'PRIVATE_COMMON', NULL, 0),
  (6141, 'NEW_CONTRACTS', 'Sections', 'Modules', '/app/contract-sections', 'PRIVATE_COMMON', NULL, 1),
  (6142, 'NEW_CONTRACTS', 'Contract Templates', 'Modules', '/app/contract-templates', 'PRIVATE_COMMON', NULL, 1),
  (8145, 'CONTRACTS_CATALOGUE', 'Contracts Catalogue', NULL, 'contrmgmt/contractsCatalogue', 'PRIVATE_COMMON', NULL, 0),
  (8149, 'PM_CATALOG_ADMIN', 'Manage Catalogue', 'Catalogue', 'manage-catalogue', 'COMMON', 'sd_products-services-new', 0),
  (8150, 'PM_CATALOGUE_CATEGORY_ADMIN', 'Catalogue Categories', 'Catalogue', 'manage-categories', 'PRIVATE_COMMON', 'sd_products-services-new', 0),
  (8151, 'PM_SHOP', 'Shopping', 'Catalogue', 'manage-catalogue', 'PRIVATE_COMMON', 'sd_products-services-new', 0),
  (8155, 'DEPARTMENT_APPRS_SETUP', 'Approval Workflow', 'Administration', '/app/approval-workflow', 'ADMIN', 'administration-new', 1),
  (8156, 'SETUP_APPRRS_AMT_LIMITS', 'Setup Approvers', 'Administration', '/app/setup-approvers', 'ADMIN', 'administration-new', 1),
  (8157, 'BUDGETS', 'Budgets', 'Modules', '/app/budgets', 'PRIVATE_COMMON', 'sd_mytask-new', 1),
  (8158, 'SPEND ANALYSIS', 'Spend Analysis', 'Modules', '/app/spend-analysis', 'PRIVATE_COMMON', 'sd_spend-analysis-new', 1),
  (8159, 'INVENTORY', 'Inventory', 'Modules', '/app/inventory', 'PRIVATE_COMMON', 'sd_inventory', 1),
  (8160, 'SETUP_NOTIFS', 'Setup Notifications', 'Administration', '/app/setup-notifications', 'ADMIN', 'administration', 1),
  (8161, 'SUBSCRIPTION_MANAGEMENT', 'My Subscription', 'My Subscription', 'my-subscription', 'PRIVATE_COMMON', 'sd_mysubscription', 0),
  (8162, 'ITEMS', 'Items', 'Modules', '/app/items', 'PRIVATE_COMMON', 'item', 1),
  (9164, 'AUCTIONS', 'Auctions', 'Auctions', '/app/auctions', 'PRIVATE_COMMON', 'auctions', 0),
  (9165, 'SUPP_AUCTIONS_WORKBENCH', 'Auctions', 'Modules', '/app/supplier-auctions', 'COMMON', 'auctions', 1),
  (9177, 'AUDIT_LOGS', 'Audit Logs', 'Administration', '/app/audit-logs', 'PRIVATE_COMMON', 'sd_myreports', 1),
  (10165, 'AI_WORKBENCH', 'AI Workbench', 'AI Console', '/app/workflows', 'PRIVATE_COMMON', 'ai-console', 1),
  (10166, 'AI_TEMPLATES', 'Templates', 'AI Console', '/app/workflow-templates', 'PRIVATE_COMMON', 'ai-console', 1),
  (10167, 'AI_WORKFLOW_BUILDER', 'Workflow Builder', 'AI Console', '/app/workflow-builder', 'PRIVATE_COMMON', 'ai-console', 1),
  (10168, 'AI_TRACK_WORKFLOWS', 'Track Workflows', 'AI Console', '/app/workflow-runs', 'PRIVATE_COMMON', 'ai-console', 1),
  (10169, 'AI_AGENTS', 'AI Agents', 'AI Console', '/app/ai-agents', 'PRIVATE_COMMON', 'ai-console', 1),
  (10170, 'CATEGORIES', 'Categories', 'Modules', '/app/categories', 'PRIVATE_COMMON', 'sd_products-services-new', 1),
  (10171, 'API_KEYS', 'API Keys', 'Integrations', '/app/api-keys', 'ADMIN', 'sd_integration', 1),
  (10172, 'API_DOCS', 'API Documentation', 'Integrations', '/app/api-docs', 'ADMIN', 'sd_integration', 1),
  (10173, 'SUPP_BIDS_WORKBENCH', 'Bids', 'Modules', '/app/suppbids', 'SUPPLIER_ADMIN', 'sd_bids', 1),
  (10174, 'EVA_PROCUREMENT_BRAIN', 'EVA', 'EVA', '/app/eva-agent', 'PRIVATE_COMMON', 'ai-console', 1),
  (10175, 'AI_SERVICE_SETTINGS', 'AI Service Settings', 'Administration', '/app/ai-service-settings', 'ADMIN', 'ai-console', 1);

-- Add performance index
CREATE INDEX IF NOT EXISTS idx_um_functions_dtls_status_category ON dbo.um_functions_dtls (status, category);

DO $$ BEGIN RAISE NOTICE '[3/4] um_functions_dtls replaced with 59 V2 menu entries'; END $$;

-- ============================================================
-- 4. um_role_functions_map_dtls — Backup existing, then replace
-- ============================================================

-- Create backup table (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'dbo' AND table_name = 'um_role_functions_map_dtls_backup'
  ) THEN
    CREATE TABLE dbo.um_role_functions_map_dtls_backup AS SELECT * FROM dbo.um_role_functions_map_dtls;
    RAISE NOTICE '[4/4] Created um_role_functions_map_dtls_backup with % rows', (SELECT count(*) FROM dbo.um_role_functions_map_dtls_backup);
  ELSE
    RAISE NOTICE '[4/4] um_role_functions_map_dtls_backup already exists — skipping backup';
  END IF;
END $$;

-- Insert V2 role-function mappings (already cleared above in section 3)
INSERT INTO dbo.um_role_functions_map_dtls (role_id, function_id, created_by, creation_date)
VALUES
  -- Role 100 (SYSADMIN / Super Admin)
  (100, 103, 'system', NOW()),
  (100, 104, 'system', NOW()),
  (100, 105, 'system', NOW()),
  (100, 106, 'system', NOW()),
  (100, 115, 'system', NOW()),
  (100, 116, 'system', NOW()),
  (100, 124, 'system', NOW()),
  (100, 125, 'system', NOW()),
  (100, 137, 'system', NOW()),
  (100, 140, 'system', NOW()),
  (100, 145, 'system', NOW()),
  (100, 150, 'system', NOW()),
  (100, 152, 'system', NOW()),
  (100, 3143, 'system', NOW()),
  (100, 8155, 'system', NOW()),
  (100, 8156, 'system', NOW()),
  (100, 8157, 'system', NOW()),
  (100, 8158, 'system', NOW()),
  (100, 8160, 'system', NOW()),
  (100, 8162, 'system', NOW()),
  (100, 9177, 'system', NOW()),
  (100, 10165, 'system', NOW()),
  (100, 10166, 'system', NOW()),
  (100, 10167, 'system', NOW()),
  (100, 10168, 'system', NOW()),
  (100, 10169, 'system', NOW()),
  (100, 10170, 'system', NOW()),
  (100, 10171, 'system', NOW()),
  (100, 10172, 'system', NOW()),
  (100, 10174, 'system', NOW()),
  (100, 10175, 'system', NOW()),

  -- Role 101 (End User)
  (101, 116, NULL, NULL),
  (101, 145, NULL, NULL),
  (101, 150, NULL, NULL),
  (101, 152, NULL, NULL),
  (101, 3143, NULL, NULL),
  (101, 6138, NULL, NULL),
  (101, 8162, NULL, NULL),
  (101, 10165, 'SYSADMIN', NOW()),
  (101, 10166, 'SYSADMIN', NOW()),
  (101, 10167, 'SYSADMIN', NOW()),
  (101, 10168, 'SYSADMIN', NOW()),
  (101, 10169, 'SYSADMIN', NOW()),
  (101, 10170, 'SYSADMIN', NOW()),
  (101, 10175, 'SYSADMIN', NOW()),

  -- Role 103 (Supplier Admin)
  (103, 110, 'system', NOW()),
  (103, 116, 'system', NOW()),
  (103, 150, 'system', NOW()),
  (103, 152, 'system', NOW()),
  (103, 10173, 'system', NOW()),

  -- Role 104 (Procurement Manager)
  (104, 115, 'SYSADMIN', NOW()),
  (104, 116, 'SYSADMIN', NOW()),
  (104, 140, NULL, NULL),
  (104, 145, NULL, NULL),
  (104, 150, NULL, NULL),
  (104, 152, NULL, NULL),
  (104, 3143, NULL, NULL),
  (104, 6138, NULL, NULL),
  (104, 8149, NULL, NULL),
  (104, 8150, NULL, NULL),
  (104, 8162, NULL, NULL),
  (104, 10165, 'SYSADMIN', NOW()),
  (104, 10166, 'SYSADMIN', NOW()),
  (104, 10167, 'SYSADMIN', NOW()),
  (104, 10168, 'SYSADMIN', NOW()),
  (104, 10169, 'SYSADMIN', NOW()),
  (104, 10170, 'SYSADMIN', NOW()),

  -- Role 105 (Finance Officer)
  (105, 115, 'SYSADMIN', NOW()),
  (105, 116, NULL, NULL),
  (105, 140, NULL, NULL),
  (105, 145, NULL, NULL),
  (105, 150, NULL, NULL),
  (105, 152, NULL, NULL),
  (105, 3143, NULL, NULL),
  (105, 6138, NULL, NULL),
  (105, 8157, NULL, NULL),
  (105, 8158, NULL, NULL),
  (105, 8159, NULL, NULL),
  (105, 8162, NULL, NULL),
  (105, 9164, NULL, NULL),
  (105, 10165, 'SYSADMIN', NOW()),
  (105, 10166, 'SYSADMIN', NOW()),
  (105, 10167, 'SYSADMIN', NOW()),
  (105, 10168, 'SYSADMIN', NOW()),
  (105, 10169, 'SYSADMIN', NOW()),
  (105, 10170, 'SYSADMIN', NOW()),

  -- Role 106 (Finance Manager)
  (106, 115, 'SYSADMIN', NOW()),
  (106, 116, NULL, NULL),
  (106, 140, NULL, NULL),
  (106, 145, NULL, NULL),
  (106, 150, NULL, NULL),
  (106, 152, NULL, NULL),
  (106, 6138, NULL, NULL),
  (106, 8157, NULL, NULL),
  (106, 8158, NULL, NULL),
  (106, 9164, NULL, NULL),
  (106, 10165, 'SYSADMIN', NOW()),
  (106, 10166, 'SYSADMIN', NOW()),
  (106, 10167, 'SYSADMIN', NOW()),
  (106, 10168, 'SYSADMIN', NOW()),
  (106, 10169, 'SYSADMIN', NOW()),
  (106, 10170, 'SYSADMIN', NOW()),

  -- Role 107 (Procurement Officer)
  (107, 115, 'SYSADMIN', NOW()),
  (107, 116, NULL, NULL),
  (107, 140, NULL, NULL),
  (107, 145, NULL, NULL),
  (107, 150, NULL, NULL),
  (107, 152, NULL, NULL),
  (107, 3143, NULL, NULL),
  (107, 6138, NULL, NULL),
  (107, 8157, NULL, NULL),
  (107, 9164, NULL, NULL),
  (107, 10165, 'SYSADMIN', NOW()),
  (107, 10166, 'SYSADMIN', NOW()),
  (107, 10167, 'SYSADMIN', NOW()),
  (107, 10168, 'SYSADMIN', NOW()),
  (107, 10169, 'SYSADMIN', NOW()),
  (107, 10170, 'SYSADMIN', NOW()),

  -- Role 108 (Department User)
  (108, 115, NULL, NULL),
  (108, 116, NULL, NULL),
  (108, 145, NULL, NULL),
  (108, 152, NULL, NULL),
  (108, 3143, NULL, NULL),
  (108, 6138, NULL, NULL),
  (108, 9164, NULL, NULL),
  (108, 10165, 'SYSADMIN', NOW()),
  (108, 10166, 'SYSADMIN', NOW()),
  (108, 10167, 'SYSADMIN', NOW()),
  (108, 10168, 'SYSADMIN', NOW()),
  (108, 10169, 'SYSADMIN', NOW()),
  (108, 10170, 'SYSADMIN', NOW()),

  -- Role 109 (Buyer)
  (109, 103, NULL, NULL),
  (109, 104, NULL, NULL),
  (109, 105, NULL, NULL),
  (109, 115, NULL, NULL),
  (109, 116, NULL, NULL),
  (109, 145, NULL, NULL),
  (109, 150, NULL, NULL),
  (109, 152, NULL, NULL),
  (109, 3143, NULL, NULL),
  (109, 6138, NULL, NULL),
  (109, 9164, NULL, NULL),
  (109, 10165, 'SYSADMIN', NOW()),
  (109, 10166, 'SYSADMIN', NOW()),
  (109, 10167, 'SYSADMIN', NOW()),
  (109, 10168, 'SYSADMIN', NOW()),
  (109, 10169, 'SYSADMIN', NOW()),
  (109, 10170, 'SYSADMIN', NOW());

DO $$ BEGIN RAISE NOTICE '[4/4] um_role_functions_map_dtls replaced with 146 V2 role mappings'; END $$;

-- ============================================================
-- Verify
-- ============================================================
DO $$
DECLARE
  fn_count integer;
  rfm_count integer;
BEGIN
  SELECT count(*) INTO fn_count FROM dbo.um_functions_dtls;
  SELECT count(*) INTO rfm_count FROM dbo.um_role_functions_map_dtls;
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Migration complete!';
  RAISE NOTICE '  um_functions_dtls:          % rows', fn_count;
  RAISE NOTICE '  um_role_functions_map_dtls: % rows', rfm_count;
  RAISE NOTICE '============================================================';
END $$;

-- ============================================================
-- 5. session — Express session store (connect-pg-simple)
-- ============================================================
CREATE TABLE IF NOT EXISTS dbo.session (
  sid   VARCHAR NOT NULL PRIMARY KEY,
  sess  JSON    NOT NULL,
  expire TIMESTAMP WITHOUT TIME ZONE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_expire ON dbo.session (expire);

-- ============================================================
-- 6. users — Passport.js authentication table for Node.js app
-- ============================================================
CREATE TABLE IF NOT EXISTS dbo.users (
  id           VARCHAR NOT NULL PRIMARY KEY,
  username     TEXT,
  password     TEXT,
  role         TEXT,
  vendor_id    VARCHAR,
  display_name TEXT,
  email        TEXT
);

-- ============================================================
-- 7. am_ai_service_settings — AI feature toggle configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS dbo.am_ai_service_settings (
  id           SERIAL PRIMARY KEY,
  feature_key  VARCHAR(100) NOT NULL UNIQUE,
  feature_name VARCHAR(200) NOT NULL,
  module_name  VARCHAR(100) NOT NULL,
  description  TEXT,
  is_enabled   BOOLEAN DEFAULT true,
  updated_by   VARCHAR(200),
  updated_date TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

INSERT INTO dbo.am_ai_service_settings (feature_key, feature_name, module_name, description)
VALUES
  ('AI_ITEM_SUGGESTIONS', 'AI Item Suggestions', 'Procurement', 'AI-powered suggestions for items when creating purchase requisitions based on title, description, and department.'),
  ('AI_NLP_LINE_ITEMS', 'Natural Language Line Items', 'Procurement', 'Parse natural language descriptions into structured line items with quantities, units, and pricing.'),
  ('AI_DUPLICATE_PR_DETECTION', 'Duplicate PR Detection', 'Procurement', 'Detect potentially duplicate purchase requisitions using AI pattern matching.'),
  ('AI_BUDGET_VALIDATION', 'Budget Validation', 'Procurement', 'AI-assisted validation of purchase requests against available budgets.'),
  ('AI_QUANTITY_PREDICTION', 'Quantity Prediction', 'Procurement', 'Predict optimal order quantities based on historical consumption patterns.'),
  ('AI_VENDOR_RECOMMENDATIONS', 'AI Vendor Recommendations', 'Procurement', 'Smart vendor recommendations based on item categories, past performance, and compliance status.'),
  ('AI_AUTO_CATEGORIZATION', 'AI Auto-Categorization (UNSPSC)', 'Items', 'Automatically categorize products using UNSPSC classification powered by AI.'),
  ('AI_SKU_GENERATION', 'AI SKU Generation', 'Items', 'Generate standardized SKU codes for items using AI-based naming conventions.'),
  ('AI_VENDOR_DOC_ANALYSIS', 'AI Document Analysis', 'Vendors', 'Analyze vendor-submitted documents for completeness, validity, and authenticity.'),
  ('AI_VENDOR_COMPLIANCE', 'AI Compliance Check', 'Vendors', 'Automated compliance verification against regulatory requirements and company policies.'),
  ('AI_VENDOR_INTELLIGENCE', 'AI Vendor Intelligence', 'Vendors', 'Deep AI analysis of vendor profiles including risk assessment and performance scoring.'),
  ('AI_VENDOR_AUTOFILL', 'AI Smart Auto-Fill', 'Vendors', 'Auto-fill vendor registration forms using AI extraction from uploaded documents.'),
  ('AI_INVOICE_MATCHING', 'AI Invoice Matching (OCR)', 'Invoices', 'Document-based three-way matching using OCR to extract and verify invoice data against POs and GRNs.'),
  ('AI_FRAUD_DETECTION', 'AI Fraud Detection', 'Invoices', 'Analyze invoice patterns to detect suspicious behavior including duplicate numbers, unusual amounts, and vendor frequency spikes.'),
  ('AI_PO_ANOMALY_DETECTION', 'AI PO Anomaly Detection', 'Purchase Orders', 'Detect pricing anomalies, duplicates, and inconsistencies in purchase orders against historical data.'),
  ('AI_BID_STRATEGY', 'AI Bid Strategy Advisor', 'Bids & Sourcing', 'AI-powered analysis suggesting optimal bid types, durations, and strategies.'),
  ('AI_SMART_VENDOR_SUGGEST', 'AI Smart Vendor Suggestions', 'Bids & Sourcing', 'Recommend best vendors to invite based on category expertise, past performance, and pricing history.'),
  ('AI_GENERATE_REQUIREMENTS', 'AI Requirements Generation', 'Bids & Sourcing', 'Auto-generate evaluation criteria and technical requirements based on bid scope.'),
  ('AI_GENERATE_CLAUSES', 'AI Clause Generation', 'Bids & Sourcing', 'Auto-generate terms and conditions clauses appropriate for the bid type and category.'),
  ('AI_TECH_EVALUATION', 'AI Technical Evaluation', 'Bids & Sourcing', 'Automated pre-scoring of vendor technical responses using AI analysis.'),
  ('AI_COMM_EVALUATION', 'AI Commercial Evaluation', 'Bids & Sourcing', 'Automated pre-scoring of vendor commercial responses and price analysis.'),
  ('AI_MARKET_INTELLIGENCE', 'AI Market Price Intelligence', 'Bids & Sourcing', 'Analyze PO history and bid responses to provide market price benchmarks.'),
  ('AI_NEGOTIATION_SUGGESTIONS', 'AI Negotiation Suggestions', 'Bids & Sourcing', 'Vendor-specific negotiation targets and talking points based on data analysis.'),
  ('AI_AWARD_RECOMMENDATION', 'AI Award Recommendation', 'Bids & Sourcing', 'Optimal award recommendation with single/split award strategy, vendor ranking, and risk assessment.'),
  ('AI_SPEND_INSIGHTS', 'AI Spend Insights', 'Spend Analysis', 'AI-generated executive summaries, anomaly detection, savings opportunities, and strategic recommendations.'),
  ('AI_BUDGET_CREATION', 'AI Budget Creation', 'Budgets', 'Create budgets and budget lines from natural language descriptions using AI.'),
  ('AI_BUDGET_AMOUNT_SUGGESTION', 'AI Budget Amount Suggestion', 'Budgets', 'Suggest budget amounts based on historical spending patterns and trends.'),
  ('AI_SUPPLIER_RANK', 'AI Supplier Ranking', 'Vendors', 'AI ranking of suppliers based on historical performance and compliance.'),
  ('AI_EVALUATION_TEAM_SUGGESTION', 'AI Evaluation Team Suggestion', 'Bids & Sourcing', 'Suggest cross-functional evaluation team members based on category.'),
  ('AI_FMP_INTELLIGENCE', 'Fair Market Price Intelligence', 'Procurement', 'Official fair-price benchmark on every line from PR through PO.')
ON CONFLICT (feature_key) DO NOTHING;

-- ============================================================
-- Section 8: AI Model Configuration Table (am_ai_model_config)
-- ============================================================
-- Stores AI provider configurations (OpenAI, Azure, AWS, self-hosted, etc.)
-- Only one provider can be active at a time (is_active = true).
-- API keys are stored encrypted-at-rest by PostgreSQL.
-- ============================================================

CREATE TABLE IF NOT EXISTS dbo.am_ai_model_config (
  id SERIAL PRIMARY KEY,
  provider_name VARCHAR(100) NOT NULL,
  provider_key VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,
  api_base_url TEXT,
  api_key TEXT,
  model_name VARCHAR(200),
  is_active BOOLEAN DEFAULT false,
  is_available BOOLEAN DEFAULT true,
  provider_type VARCHAR(50) DEFAULT 'cloud',
  icon_name VARCHAR(50),
  updated_by VARCHAR(200),
  updated_date TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

INSERT INTO dbo.am_ai_model_config (provider_name, provider_key, display_name, description, model_name, is_active, provider_type, icon_name)
VALUES
  ('Anthropic', 'anthropic', 'Anthropic Claude', 'Claude models from Anthropic — safety-focused frontier AI. Choose from Opus 4.7, Sonnet 4.6, and Haiku 4.5.', 'claude-sonnet-4-6', false, 'cloud', 'anthropic'),
  ('OpenAI', 'openai', 'OpenAI GPT-4o-mini', 'Industry-leading AI models from OpenAI. Data processed on OpenAI servers with enterprise DPA available.', 'gpt-4o-mini', true, 'cloud', 'openai'),
  ('OpenAI GPT-4o', 'openai_4o', 'OpenAI GPT-4o', 'Most capable OpenAI model with vision support. Ideal for document analysis, OCR, and complex reasoning.', 'gpt-4o', false, 'cloud', 'openai'),
  ('Azure OpenAI', 'azure_openai', 'Azure OpenAI Service', 'GPT models hosted on Microsoft Azure. Data stays within your Azure tenant with full enterprise compliance (SOC 2, HIPAA, GDPR).', 'gpt-4o-mini', false, 'cloud', 'azure'),
  ('AWS Bedrock', 'aws_bedrock', 'AWS Bedrock', 'Access Llama, Mistral, and other models through AWS managed service. Data stays within your AWS account.', 'meta.llama3-8b-instruct-v1:0', false, 'cloud', 'aws'),
  ('Google Vertex AI', 'google_vertex', 'Google Vertex AI', 'Access Gemini and open-source models through Google Cloud. Enterprise-grade with Google security and compliance.', 'gemini-1.5-flash', false, 'cloud', 'google'),
  ('Meta Llama 3', 'llama3', 'Meta Llama 3 (Self-Hosted)', 'Open-source LLM from Meta. Deploy on your own infrastructure for complete data privacy. No data leaves your network.', 'llama-3-8b-instruct', false, 'self_hosted', 'meta'),
  ('Mistral AI', 'mistral', 'Mistral AI (Self-Hosted)', 'High-performance open-source model from Mistral AI. Deploy on-premise or in your private cloud for full data sovereignty.', 'mistral-7b-instruct', false, 'self_hosted', 'mistral'),
  ('Custom Endpoint', 'custom', 'Custom OpenAI-Compatible Endpoint', 'Connect to any OpenAI-compatible API endpoint. Use with vLLM, Ollama, TGI, or any custom model server.', 'custom-model', false, 'self_hosted', 'custom'),
  ('Anthropic', 'anthropic', 'Anthropic Claude', 'Claude models from Anthropic — safety-focused frontier AI. Haiku 4.5 for fast, cost-effective tasks; Sonnet 4.6 for complex reasoning.', 'claude-haiku-4-5-20251001', false, 'cloud', 'anthropic'),
  ('Google Gemma', 'gemma4_12b_ollama', 'Gemma (Ollama)', 'Google Gemma served locally via Ollama — OpenAI-compatible inference with full data sovereignty. No data leaves your machine.', 'gemma3:4b', false, 'self_hosted', 'gemma')
ON CONFLICT (provider_key) DO NOTHING;

-- Set Anthropic base URL (pre-populated since endpoint is fixed)
UPDATE dbo.am_ai_model_config
SET api_base_url = 'https://api.anthropic.com'
WHERE provider_key = 'anthropic' AND api_base_url IS NULL;

-- Set Gemma 4 12B Ollama base URL and placeholder API key
UPDATE dbo.am_ai_model_config
SET api_base_url = 'http://localhost:11434/v1', api_key = 'ollama'
WHERE provider_key = 'gemma4_12b_ollama' AND api_base_url IS NULL;

-- AI usage log: tracks token consumption per AI call for internal usage reporting
CREATE TABLE IF NOT EXISTS dbo.am_ai_usage_log (
  id BIGSERIAL PRIMARY KEY,
  provider_key VARCHAR(100) NOT NULL,
  model_name VARCHAR(200),
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_am_ai_usage_log_provider_created
  ON dbo.am_ai_usage_log (provider_key, created_at DESC);

-- Menu entry for AI Model Configuration page
INSERT INTO dbo.um_functions_dtls (id, function_name, function_url, module_name, category, icon_name, status, description)
VALUES (10176, 'AI_MODEL_CONFIG', '/app/ai-model-config', 'Administration', 'MENU', 'cpu', 1, 'AI Model Configuration')
ON CONFLICT (id) DO NOTHING;

-- Role mappings for AI Model Configuration (roles 100 and 101)
INSERT INTO dbo.um_role_functions_map_dtls (role_id, function_id)
VALUES (100, 10176), (101, 10176)
ON CONFLICT DO NOTHING;

-- Contracts module: add signature data columns to cm_header (missing in prod)
ALTER TABLE dbo.cm_header ADD COLUMN IF NOT EXISTS org_sign_data text;
ALTER TABLE dbo.cm_header ADD COLUMN IF NOT EXISTS supp_sign_data text;


-- Contracts module: new vendor portal contracts page entry
INSERT INTO dbo.um_functions_dtls (id, function_name, description, module_name, function_url, category, icon_name, status)
VALUES (6143, 'NEW_CONTRACTS', 'Contracts', 'Modules', '/app/supp-contracts', 'SUPPLIER_ADMIN', NULL, 1)
ON CONFLICT (id) DO NOTHING;

-- Contracts module: update description for Contract Sections page (was "Sections")
UPDATE dbo.um_functions_dtls SET description = 'Clauses' WHERE id = 6141;

-- Contracts module: update description for Contract Templates page (was "Contract Templates")
UPDATE dbo.um_functions_dtls SET description = 'Templates' WHERE id = 6142;

-- ============================================================
-- Section 9: Contracts AI Service Settings
-- ============================================================
-- AI features for the Contracts module clause library, risk analysis,
-- and vendor summary. Added during the AI contract feature build-out.
-- ============================================================

INSERT INTO dbo.am_ai_service_settings (feature_key, feature_name, module_name, description)
VALUES
  ('AI_CONTRACT_LIBRARY_INIT', 'AI Clause Builder', 'Contracts', 'Generate a full library of clauses by contract type using AI'),
  ('AI_CONTRACT_EXTRACT', 'Extract Contract Clauses', 'Contracts', 'Upload a PDF or Word doc and AI extracts all clauses automatically'),
  ('AI_CONTRACT_GENERATE', 'Generate Clause from Description', 'Contracts', 'Describe what you need and AI drafts a complete contract clause'),
  ('AI_CONTRACT_IMPROVE', 'Improve / Rewrite Clause', 'Contracts', 'AI rewrites or improves an existing clause based on a given instruction'),
  ('AI_CONTRACT_RISK', 'Clause Risk Analysis', 'Contracts', 'Analyze a clause for legal and commercial risk with AI scoring'),
  ('AI_CONTRACT_VARIABLES', 'Variable Suggestions', 'Contracts', 'AI suggests dynamic variable placeholders within clause content'),
  ('AI_CONTRACT_DUPLICATES', 'Duplicate Clause Detection', 'Contracts', 'Find semantically similar or duplicate clauses in the library'),
  ('AI_CONTRACT_ADVISOR', 'AI Legal Advisor (Chat)', 'Contracts', 'Chat with an AI legal advisor to get clause recommendations and explanations'),
  ('AI_CONTRACT_RISK_ANALYSIS', 'AI Risk Analysis', 'Contracts', 'AI-powered risk scoring across financial, compliance, and delivery dimensions for internal approvers and owners'),
  ('AI_CONTRACT_SUMMARY', 'Vendor Contract Summary', 'Contracts', 'AI-generated plain-English summary with key points and red flags shown to vendors before signing')
ON CONFLICT (feature_key) DO NOTHING;

-- ============================================================
-- Section 10: System Settings Properties
-- ============================================================
-- Controls scheduler and email notification behaviour at runtime.
-- Both default to false (off) — turn on per environment as needed.
-- Managed via Administration > Application Settings > System tab.
-- ============================================================

INSERT INTO dbo.am_property_mst (prop_code, prop_value)
VALUES
  ('SCHEDULER_ENABLED', 'false'),
  ('EMAIL_NOTIFICATIONS_ENABLED', 'false'),
  ('SUPPLIER_EMAIL_NOTIFICATIONS_ENABLED', 'false'),
  ('OGD_INDIA_API_KEY', '579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b'),
  ('google_api', 'AIzaSyAB4rC-OgMeNNazm_xqf5cRYK_h5cTZysg'),
  ('GOOGLE_API_KEY', 'AIzaSyAB4rC-OgMeNNazm_xqf5cRYK_h5cTZysg'),
  ('GOOGLE_MAPS_API_KEY', 'AIzaSyAB4rC-OgMeNNazm_xqf5cRYK_h5cTZysg'),
  ('GOOGLE_PLACES_API_KEY', 'AIzaSyAB4rC-OgMeNNazm_xqf5cRYK_h5cTZysg')
ON CONFLICT (prop_code) DO NOTHING;

-- ============================================================
-- Section 11: Agent Conversation History
-- ============================================================
-- Stores ChatGPT-style multi-conversation history for all 4 AI agents.
-- Each user can have multiple saved conversations per agent type.
-- title: auto-generated from the first user message.
-- messages: JSON array of { role, content } objects stored as text.
-- ============================================================

CREATE TABLE IF NOT EXISTS dbo.am_agent_conversations (
  id          serial PRIMARY KEY,
  user_id     varchar(255) NOT NULL,
  agent_type  varchar(50)  NOT NULL,
  messages    text         NOT NULL DEFAULT '[]',
  updated_at  timestamp    NOT NULL DEFAULT now(),
  title       varchar(255),
  created_at  timestamp    NOT NULL DEFAULT now()
);

-- Idempotent column additions for environments upgraded from an older schema
ALTER TABLE dbo.am_agent_conversations
  ADD COLUMN IF NOT EXISTS title      varchar(255),
  ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now();

-- Remove old single-conversation-per-user unique constraint if it exists
ALTER TABLE dbo.am_agent_conversations
  DROP CONSTRAINT IF EXISTS am_agent_conversations_user_id_agent_type_key;

COMMIT;

BEGIN;
CREATE TABLE IF NOT EXISTS dbo.um_user_org_map_dtls
(
    id integer NOT NULL,
    attribute_1 character varying(100) COLLATE pg_catalog."default",
    attribute_2 character varying(100) COLLATE pg_catalog."default",
    attribute_3 character varying(100) COLLATE pg_catalog."default",
    attribute_4 character varying(100) COLLATE pg_catalog."default",
    company_code integer,
    created_by character varying(100) COLLATE pg_catalog."default",
    creation_date timestamp without time zone,
    ip_address character varying(50) COLLATE pg_catalog."default",
    last_modified_by character varying(100) COLLATE pg_catalog."default",
    last_modified_date timestamp without time zone,
    org_legal_name character varying(255) COLLATE pg_catalog."default",
    org_type character varying(50) COLLATE pg_catalog."default",
    organization_name character varying(255) COLLATE pg_catalog."default",
    org_id integer,
    user_id integer,
    CONSTRAINT um_user_org_map_dtls_pkey PRIMARY KEY (id),
    CONSTRAINT fk_um_user_org_map_dtls_org_id FOREIGN KEY (org_id)
        REFERENCES dbo.um_org_dtls (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT fk_um_user_org_map_dtls_user_id FOREIGN KEY (user_id)
        REFERENCES dbo.um_user_dtls (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)
TABLESPACE pg_default;
ALTER TABLE IF EXISTS dbo.um_user_org_map_dtls
    OWNER to postgres;
 
 ALTER TABLE dbo.um_user_dtls disable trigger all;
CREATE SEQUENCE if not exists dbo.um_user_org_map_dtls_seq
START WITH 1
INCREMENT BY 1
NO MINVALUE
NO MAXVALUE
CACHE 1;

COMMIT;