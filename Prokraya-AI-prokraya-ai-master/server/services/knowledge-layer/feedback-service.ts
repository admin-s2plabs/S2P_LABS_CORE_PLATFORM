import { pool } from "../../modules/_shared";
import { getContextPool } from "../../tenant-context";

/**
 * Per-user feedback capture and retrieval for AI agents (Knowledge Layer, Phase 4).
 *
 * The loop is: capture a thumb -> distil it into a short lesson -> inject that lesson into
 * the DYNAMIC SUFFIX of the same user's next similar prompt. Feedback therefore changes the
 * *context* the model sees, never the code path it runs: tools, the prepare/execute
 * confirmation gate, and streaming are all untouched.
 *
 * Two invariants this module must never break:
 *   1. USER-SPECIFIC — every statement filters on user_id AND agent_type. There is no
 *      global-lesson concept and no query here omits user_id.
 *   2. FAIL-OPEN — retrieval never throws. A missing table, a slow query or a bad row
 *      yields "" so the agent answers exactly as it does today. This is what allows the
 *      code to ship before the migration has been applied in a given environment.
 */

const getPool = () => getContextPool() ?? pool;

/** Injected guidance is capped so it cannot crowd out the prompt. */
const MAX_LESSONS = 3;
const MAX_GUIDANCE_CHARS = 900;
const MAX_ACTIVE_LESSONS_PER_USER = 50;

/** Compact evidence limits (requirement: store a compact version, not transcripts). */
const MAX_QUERY_CHARS = 500;
const MAX_RESPONSE_CHARS = 1000;
const MAX_COMMENT_CHARS = 2000;

/**
 * Relevance floor for ts_rank.
 *
 * Calibrated against real values: a single shared content lexeme scores ~0.020 and each
 * additional overlapping term raises it. 0.01 therefore means "shares at least one
 * meaningful word" — stopwords are already stripped by to_tsquery, so this is a genuine
 * content overlap rather than noise. Quality is then governed by rank ordering plus the
 * 3-lesson cap, which is the right trade-off here: guidance is advisory, subordinate to
 * every business rule, and capped, so erring slightly generous costs little while a floor
 * set too high silently disables the whole feature.
 */
const RELEVANCE_FLOOR = 0.01;

/**
 * Builds an OR-matched tsquery from free text.
 *
 * `plainto_tsquery` ANDs every term, which is far too strict for "a similar query next
 * time": asking "show me my draft PRs" would fail to match a lesson stored under
 * "listing purchase requisitions by status" simply because the token `pr` is absent.
 * We therefore take plainto_tsquery's already-normalised, already-sanitised lexeme output
 * ('show' & 'draft' & 'pr') and rejoin it with `|`, then rank by overlap so the best match
 * still wins. NULLIF keeps an all-stopword query from matching everything.
 */
const OR_TSQUERY = `
  NULLIF(
    array_to_string(
      regexp_split_to_array(plainto_tsquery('english', $QUERY$)::text, ' & '),
      ' | '
    ), ''
  )::tsquery`;

export type FeedbackStatus = "pending" | "active" | "superseded" | "failed" | "disabled";

export interface RecordFeedbackInput {
  userId: string;
  agentType: string;
  conversationId?: number | null;
  messageIndex: number;
  rating: 1 | -1;
  comment?: string | null;
  queryText?: string | null;
  responseText?: string | null;
  promptVersion?: string | null;
  modelUsed?: string | null;
}

export interface FeedbackRow {
  id: number;
  rating: number;
  comment: string | null;
  guidance: string | null;
  topic_summary: string | null;
  status: FeedbackStatus;
  created_at: string;
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * Upsert a thumb. Returns fast — distillation happens separately, off the request path,
 * so the UI never waits on an LLM call.
 *
 * A thumbs-up is stored with status 'active' and no guidance: it is never distilled and
 * never injected (see supersedeConflictingLessons for what it is actually for).
 */
export async function recordFeedback(input: RecordFeedbackInput): Promise<{ id: number; status: FeedbackStatus }> {
  const status: FeedbackStatus = input.rating === -1 ? "pending" : "active";

  const result = await getPool().query(
    `INSERT INTO dbo.am_agent_feedback
       (user_id, agent_type, conversation_id, message_index, rating, comment,
        query_text, response_text, prompt_version, model_used, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (user_id, conversation_id, message_index) DO UPDATE SET
       rating        = EXCLUDED.rating,
       comment       = EXCLUDED.comment,
       query_text    = COALESCE(EXCLUDED.query_text, dbo.am_agent_feedback.query_text),
       response_text = COALESCE(EXCLUDED.response_text, dbo.am_agent_feedback.response_text),
       status        = EXCLUDED.status,
       -- a flipped rating invalidates any lesson distilled from the previous one
       guidance      = CASE WHEN EXCLUDED.rating = 1 THEN NULL ELSE dbo.am_agent_feedback.guidance END,
       updated_at    = now()
     RETURNING id, status`,
    [
      input.userId,
      input.agentType,
      input.conversationId ?? null,
      input.messageIndex,
      input.rating,
      truncate(input.comment, MAX_COMMENT_CHARS),
      truncate(input.queryText, MAX_QUERY_CHARS),
      truncate(input.responseText, MAX_RESPONSE_CHARS),
      input.promptVersion ?? null,
      input.modelUsed ?? null,
      status,
    ],
  );

  return { id: result.rows[0].id, status: result.rows[0].status };
}

/**
 * Retrieve this user's lessons that are relevant to the query they just asked, rendered as
 * a compact bullet list ready for the prompt.
 *
 * Relevance uses built-in PostgreSQL full-text search against `search_text` (the distilled
 * topic), not the raw query. Matching a distilled topic generalises across paraphrases:
 * "list my draft PRs" and "show me PRs in draft status" share few tokens but distil to the
 * same topic.
 *
 * NEVER THROWS — see the fail-open invariant at the top of this file.
 */
export async function getFeedbackGuidance(
  userId: string | null | undefined,
  agentType: string,
  query: string,
): Promise<string> {
  if (!userId || !query?.trim()) return "";

  try {
    const result = await getPool().query(
      `WITH q AS (SELECT ${OR_TSQUERY.replace("$QUERY$", "$3")} AS tsq)
       SELECT guidance,
              ts_rank(to_tsvector('english', coalesce(search_text,'')), q.tsq) AS rank
         FROM dbo.am_agent_feedback, q
        WHERE user_id = $1
          AND agent_type = $2
          AND status = 'active'
          AND rating = -1
          AND guidance IS NOT NULL
          AND q.tsq IS NOT NULL
          AND to_tsvector('english', coalesce(search_text,'')) @@ q.tsq
        ORDER BY rank DESC, created_at DESC
        LIMIT $4`,
      [userId, agentType, query.slice(0, MAX_QUERY_CHARS), MAX_LESSONS],
    );

    const lines: string[] = [];
    let budget = MAX_GUIDANCE_CHARS;

    for (const row of result.rows) {
      if (Number(row.rank) < RELEVANCE_FLOOR) continue;
      const line = `- ${String(row.guidance).trim()}`;
      if (line.length > budget) break;
      lines.push(line);
      budget -= line.length;
    }

    return lines.join("\n");
  } catch (err: any) {
    // Missing table, DB blip, statement timeout — the agent must still answer.
    console.warn(`[knowledge-layer] feedback guidance unavailable (${err?.message ?? err}); continuing without it`);
    return "";
  }
}

/** Rows awaiting distillation, oldest first. */
export async function claimPendingFeedback(limit = 5): Promise<
  Array<{ id: number; user_id: string; agent_type: string; comment: string | null; query_text: string | null; response_text: string | null }>
> {
  const result = await getPool().query(
    `SELECT id, user_id, agent_type, comment, query_text, response_text
       FROM dbo.am_agent_feedback
      WHERE status = 'pending' AND rating = -1
      ORDER BY created_at ASC
      LIMIT $1`,
    [limit],
  );
  return result.rows;
}

/** Store a distilled lesson and activate it. */
export async function applyDistilledLesson(
  id: number,
  lesson: { guidance: string; topicSummary: string; searchText: string },
): Promise<void> {
  await getPool().query(
    `UPDATE dbo.am_agent_feedback
        SET guidance = $2, topic_summary = $3, search_text = $4,
            status = 'active', updated_at = now()
      WHERE id = $1`,
    [id, lesson.guidance.slice(0, 400), lesson.topicSummary.slice(0, 200), lesson.searchText],
  );
}

/**
 * Mark a row terminal without deleting it: 'failed' when nothing actionable could be
 * distilled (better than storing vague filler that would pollute future prompts).
 */
export async function markFeedbackStatus(id: number, status: FeedbackStatus): Promise<void> {
  await getPool().query(
    `UPDATE dbo.am_agent_feedback SET status = $2, updated_at = now() WHERE id = $1`,
    [id, status],
  );
}

/**
 * A thumbs-up retires this user's older negative lessons on the same topic.
 *
 * This is the main reason thumbs-up rows are stored at all: without it, a correction the
 * user has since been satisfied with would keep firing forever.
 */
export async function supersedeConflictingLessons(
  userId: string,
  agentType: string,
  query: string,
): Promise<number> {
  if (!query?.trim()) return 0;
  try {
    // Uses the SAME matching and floor as retrieval, so a thumbs-up retires exactly the
    // lessons that would have fired for this query — no more, no less.
    const result = await getPool().query(
      `WITH q AS (SELECT ${OR_TSQUERY.replace("$QUERY$", "$3")} AS tsq)
       UPDATE dbo.am_agent_feedback f
          SET status = 'superseded', updated_at = now()
         FROM q
        WHERE f.user_id = $1
          AND f.agent_type = $2
          AND f.status = 'active'
          AND f.rating = -1
          AND q.tsq IS NOT NULL
          AND to_tsvector('english', coalesce(f.search_text,'')) @@ q.tsq
          AND ts_rank(to_tsvector('english', coalesce(f.search_text,'')), q.tsq) >= $4`,
      [userId, agentType, query.slice(0, MAX_QUERY_CHARS), RELEVANCE_FLOOR],
    );
    return result.rowCount ?? 0;
  } catch (err: any) {
    console.warn(`[knowledge-layer] supersede skipped (${err?.message ?? err})`);
    return 0;
  }
}

/** Keep the active set bounded; retires the oldest beyond the cap. */
export async function pruneExcessLessons(userId: string, agentType: string): Promise<void> {
  try {
    await getPool().query(
      `UPDATE dbo.am_agent_feedback SET status = 'superseded', updated_at = now()
        WHERE id IN (
          SELECT id FROM dbo.am_agent_feedback
           WHERE user_id = $1 AND agent_type = $2 AND status = 'active' AND rating = -1
           ORDER BY created_at DESC
          OFFSET $3
        )`,
      [userId, agentType, MAX_ACTIVE_LESSONS_PER_USER],
    );
  } catch {
    /* best-effort */
  }
}

/**
 * Permanently delete every feedback row belonging to ONE user for ONE agent.
 *
 * Scoped by `user_id` AND `agent_type` in the predicate, so it can never touch another
 * user's rows or another agent's rows. This is a hard delete (the user asked to "reset"),
 * so it is irreversible and also discards the analytics value of those rows — the softer
 * alternative is `setFeedbackStatusForUser(id, userId, "disabled")` per row.
 *
 * Returns the number of rows removed.
 */
export async function deleteAllFeedbackForUser(userId: string, agentType: string): Promise<number> {
  const result = await getPool().query(
    `DELETE FROM dbo.am_agent_feedback WHERE user_id = $1 AND agent_type = $2`,
    [userId, agentType],
  );
  return result.rowCount ?? 0;
}

/** How many rows this user currently has for an agent — used to confirm before resetting. */
export async function countFeedbackForUser(userId: string, agentType: string): Promise<{ total: number; activeLessons: number }> {
  const result = await getPool().query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'active' AND rating = -1 AND guidance IS NOT NULL)::int AS active_lessons
       FROM dbo.am_agent_feedback
      WHERE user_id = $1 AND agent_type = $2`,
    [userId, agentType],
  );
  return { total: result.rows[0]?.total ?? 0, activeLessons: result.rows[0]?.active_lessons ?? 0 };
}

/** This user's own feedback history. Ownership is enforced in the predicate. */
export async function listFeedbackForUser(userId: string, agentType: string): Promise<FeedbackRow[]> {
  const result = await getPool().query(
    `SELECT id, rating, comment, guidance, topic_summary, status, created_at
       FROM dbo.am_agent_feedback
      WHERE user_id = $1 AND agent_type = $2
      ORDER BY created_at DESC
      LIMIT 100`,
    [userId, agentType],
  );
  return result.rows;
}

/**
 * Let a user retract a lesson that is making their replies worse.
 * `user_id` is part of the predicate, so another user's id simply matches zero rows.
 */
export async function setFeedbackStatusForUser(
  id: number,
  userId: string,
  status: Extract<FeedbackStatus, "active" | "disabled">,
): Promise<boolean> {
  const result = await getPool().query(
    `UPDATE dbo.am_agent_feedback SET status = $3, updated_at = now()
      WHERE id = $1 AND user_id = $2`,
    [id, userId, status],
  );
  return (result.rowCount ?? 0) > 0;
}
