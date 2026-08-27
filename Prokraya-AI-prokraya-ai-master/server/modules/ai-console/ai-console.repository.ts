import { pool } from "../_shared";
import { getContextPool } from "../../tenant-context";
const getPool = () => getContextPool() ?? pool;

// ─── Legacy single-conversation (kept for internal use) ───────────────────────

export async function clearAllAgentConversations(userId: string): Promise<void> {
  await getPool().query(
    `DELETE FROM dbo.am_agent_conversations WHERE user_id = $1`,
    [userId]
  );
}

// ─── Multi-conversation support ───────────────────────────────────────────────

export interface ConversationSummary {
  id: number;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export async function listAgentConversations(
  userId: string,
  agentType: string
): Promise<ConversationSummary[]> {
  const result = await getPool().query(
    `SELECT id, title, created_at, updated_at
     FROM dbo.am_agent_conversations
     WHERE user_id = $1 AND agent_type = $2
     ORDER BY updated_at DESC`,
    [userId, agentType]
  );
  return result.rows;
}

export async function createAgentConversation(
  userId: string,
  agentType: string
): Promise<number> {
  const result = await getPool().query(
    `INSERT INTO dbo.am_agent_conversations (user_id, agent_type, messages, created_at, updated_at)
     VALUES ($1, $2, '[]', NOW(), NOW()) RETURNING id`,
    [userId, agentType]
  );
  return result.rows[0].id;
}

export async function getAgentConversationById(
  id: number,
  userId: string
): Promise<any[]> {
  const result = await getPool().query(
    `SELECT messages FROM dbo.am_agent_conversations WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  if (!result.rows[0]) return [];
  try {
    return JSON.parse(result.rows[0].messages || "[]");
  } catch {
    return [];
  }
}

export async function saveAgentConversationById(
  id: number,
  userId: string,
  messages: any[],
  title?: string
): Promise<void> {
  if (title) {
    await getPool().query(
      `UPDATE dbo.am_agent_conversations
       SET messages = $1, title = COALESCE(title, $2), updated_at = NOW()
       WHERE id = $3 AND user_id = $4`,
      [JSON.stringify(messages), title, id, userId]
    );
  } else {
    await getPool().query(
      `UPDATE dbo.am_agent_conversations
       SET messages = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3`,
      [JSON.stringify(messages), id, userId]
    );
  }
}

export async function deleteAgentConversationById(
  id: number,
  userId: string
): Promise<void> {
  await getPool().query(
    `DELETE FROM dbo.am_agent_conversations WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
}
