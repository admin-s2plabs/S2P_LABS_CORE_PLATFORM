-- Per-user AI agent feedback + distilled improvement lessons (Knowledge Layer, Phase 4).
-- Idempotent; safe to re-run. Run against EACH tenant database, exactly like
-- 20260424_am_agent_conversations.sql -- these rows live in the per-tenant DB.
--
-- Scope model: the per-tenant DB isolates customers; the user_id column isolates users
-- WITHIN a tenant. Every read in feedback-service.ts filters on user_id + agent_type,
-- so one user's feedback can never influence another user's responses.

CREATE SCHEMA IF NOT EXISTS dbo;

CREATE TABLE IF NOT EXISTS dbo.am_agent_feedback (
  id               bigserial PRIMARY KEY,

  -- Scope. Both are mandatory filters on every read.
  user_id          varchar(255) NOT NULL,
  agent_type       varchar(50)  NOT NULL,

  -- Provenance. conversation_id is intentionally nullable with no FK: a brand-new
  -- conversation may not have a persisted id when the first reply lands, and dropping
  -- that signal would be worse than losing referential integrity.
  conversation_id  integer,
  message_index    integer      NOT NULL,

  -- The signal.
  rating           smallint     NOT NULL,   -- 1 = thumbs up, -1 = thumbs down
  comment          text,                    -- user's own words; may be NULL or blank

  -- Compact evidence. Truncated at write time; never full transcripts.
  query_text       text,                    -- <= 500 chars
  response_text    text,                    -- <= 1000 chars

  -- Distilled lesson. `guidance` is the ONLY column ever injected into a prompt.
  guidance         varchar(400),
  topic_summary    varchar(200),
  search_text      text,                    -- text used for relevance matching
  status           varchar(20)  NOT NULL DEFAULT 'pending',
                                            -- pending | active | superseded | failed | disabled

  -- Diagnostics. A reference, never a copy of the prompt itself.
  prompt_version   varchar(80),
  model_used       varchar(200),

  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);

-- One row per (user, conversation, message): re-clicking a thumb updates, never duplicates.
-- NULLS NOT DISTINCT (PostgreSQL 15+) makes the guard hold even when conversation_id is
-- NULL, which a plain unique index would not do.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'am_agent_feedback_uniq'
  ) THEN
    BEGIN
      EXECUTE 'CREATE UNIQUE INDEX am_agent_feedback_uniq
               ON dbo.am_agent_feedback (user_id, conversation_id, message_index)
               NULLS NOT DISTINCT';
    EXCEPTION WHEN syntax_error OR feature_not_supported THEN
      -- PostgreSQL < 15: fall back to a plain unique index. The application layer still
      -- de-duplicates, so this only weakens the guard for unsaved conversations.
      EXECUTE 'CREATE UNIQUE INDEX am_agent_feedback_uniq
               ON dbo.am_agent_feedback (user_id, conversation_id, message_index)';
    END;
  END IF;
END $$;

-- Hot read path: active lessons for one user + agent.
CREATE INDEX IF NOT EXISTS am_agent_feedback_lookup
  ON dbo.am_agent_feedback (user_id, agent_type, status);

-- Relevance ranking with built-in full-text search. No pg_trgm/pgvector extension needed.
CREATE INDEX IF NOT EXISTS am_agent_feedback_fts
  ON dbo.am_agent_feedback
  USING gin (to_tsvector('english', coalesce(search_text, '')));
