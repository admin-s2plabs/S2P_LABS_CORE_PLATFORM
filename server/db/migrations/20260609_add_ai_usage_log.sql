-- Migration: Create AI usage log table for internal token tracking
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
