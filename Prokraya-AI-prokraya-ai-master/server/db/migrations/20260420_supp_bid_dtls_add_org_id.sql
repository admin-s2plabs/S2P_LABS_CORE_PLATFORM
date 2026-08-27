-- Migration: Add org_id column to supp_bid_dtls table
ALTER TABLE dbo.supp_bid_dtls
  ADD COLUMN IF NOT EXISTS org_id INTEGER;
