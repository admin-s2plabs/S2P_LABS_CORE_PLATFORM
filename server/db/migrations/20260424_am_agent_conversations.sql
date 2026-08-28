-- AI agent multi-conversation history (Vendor / Sourcing / Payables / Registration).
-- Idempotent; safe to run on any environment that uses dbo (matches scripts/migrate-prokraya-v2.sql section 11).

CREATE SCHEMA IF NOT EXISTS dbo;

CREATE TABLE IF NOT EXISTS dbo.am_agent_conversations (
  id          serial PRIMARY KEY,
  user_id     varchar(255) NOT NULL,
  agent_type  varchar(50)  NOT NULL,
  messages    text         NOT NULL DEFAULT '[]',
  updated_at  timestamp    NOT NULL DEFAULT now(),
  title       varchar(255),
  created_at  timestamp    NOT NULL DEFAULT now()
);

ALTER TABLE dbo.am_agent_conversations
  ADD COLUMN IF NOT EXISTS title      varchar(255);

ALTER TABLE dbo.am_agent_conversations
  ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now();

ALTER TABLE dbo.am_agent_conversations
  DROP CONSTRAINT IF EXISTS am_agent_conversations_user_id_agent_type_key;
