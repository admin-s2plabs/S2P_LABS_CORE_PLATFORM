import { getAIClient, getAIModelName } from "../ai-client";
import { renderPrompt } from "./prompt-renderer";
import { applyDistilledLesson, markFeedbackStatus, pruneExcessLessons } from "./feedback-service";

/**
 * Turns a raw thumbs-down into a short, reusable lesson.
 *
 * Runs fire-and-forget AFTER the HTTP response, so the user never waits on it. Every failure
 * path is terminal-but-safe: the row is marked 'failed' and simply never influences a prompt.
 *
 * Handles the "user left no useful comment" case by asking the model to critique the
 * question/answer pair itself — see ai/prompts/feedback-distiller.hbs rule 2.
 */

/**
 * Model used for distillation. This is background summarisation, not user-facing reasoning,
 * so it should run on something cheap.
 *
 * NOTE: the plan proposed hard-pinning Haiku 4.5. That is only valid when Anthropic is the
 * active provider — this deployment's provider is configurable (OpenAI / Anthropic / Ollama /
 * Gemma), and a hard-coded Anthropic model id would break every non-Anthropic tenant. So the
 * pin is expressed as an env override instead: set AI_FEEDBACK_MODEL to force a cheap model,
 * otherwise fall back to whatever is configured and active.
 */
async function distillerModel(): Promise<string> {
  return process.env.AI_FEEDBACK_MODEL || (await getAIModelName());
}

const MAX_GUIDANCE_CHARS = 300;

/** Reject guidance that tries to command tools or override the system. */
const FORBIDDEN_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  /disregard\s+(the\s+)?(rules?|instructions?|system)/i,
  /\b(system\s+prompt|you\s+are\s+now)\b/i,
  /\b(prepare|execute)_[a-z_]+/i, // must not direct tool usage
];

interface DistilledLesson {
  usable: boolean;
  topic_summary: string;
  guidance: string;
}

function parseLesson(raw: string): DistilledLesson | null {
  // Models occasionally wrap JSON in a fence despite instructions.
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (typeof parsed?.usable !== "boolean") return null;
    return {
      usable: parsed.usable,
      topic_summary: String(parsed.topic_summary ?? "").trim(),
      guidance: String(parsed.guidance ?? "").trim(),
    };
  } catch {
    return null;
  }
}

/** Second line of defence — the prompt asks for these constraints, this enforces them. */
function isAcceptable(lesson: DistilledLesson): boolean {
  if (!lesson.usable) return false;
  if (!lesson.guidance || !lesson.topic_summary) return false;
  if (lesson.guidance.length > MAX_GUIDANCE_CHARS) return false;
  return !FORBIDDEN_PATTERNS.some((re) => re.test(lesson.guidance));
}

export interface DistillInput {
  id: number;
  userId: string;
  agentType: string;
  queryText: string | null;
  responseText: string | null;
  comment: string | null;
}

/**
 * Distil one feedback row. Resolves to true when an active lesson was stored.
 * Never rejects — callers use it fire-and-forget.
 */
export async function distillFeedback(input: DistillInput): Promise<boolean> {
  try {
    if (!input.queryText && !input.responseText) {
      await markFeedbackStatus(input.id, "failed");
      return false;
    }

    const prompt = renderPrompt("feedback-distiller", {
      queryText: input.queryText ?? "(not captured)",
      responseText: input.responseText ?? "(not captured)",
      comment: input.comment ?? "",
    });

    const client = await getAIClient();
    const model = await distillerModel();

    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: "system", content: prompt }],
      temperature: 0, // deterministic summarisation
      max_tokens: 300,
    });

    const lesson = parseLesson(completion.choices[0]?.message?.content ?? "");

    if (!lesson || !isAcceptable(lesson)) {
      // Storing vague filler would pollute every future prompt — better to store nothing.
      await markFeedbackStatus(input.id, "failed");
      return false;
    }

    await applyDistilledLesson(input.id, {
      guidance: lesson.guidance,
      topicSummary: lesson.topic_summary,
      // Matching on topic + original question generalises across paraphrases.
      searchText: `${lesson.topic_summary} ${input.queryText ?? ""}`.trim(),
    });

    await pruneExcessLessons(input.userId, input.agentType);
    return true;
  } catch (err: any) {
    console.warn(`[knowledge-layer] feedback distillation failed for row ${input.id}: ${err?.message ?? err}`);
    try {
      await markFeedbackStatus(input.id, "failed");
    } catch {
      /* row stays 'pending'; it is never read while not 'active' */
    }
    return false;
  }
}

/**
 * Fire-and-forget wrapper. Intentionally returns void so a caller cannot accidentally
 * await it and put an LLM round-trip on the user's request path.
 */
export function distillFeedbackInBackground(input: DistillInput): void {
  void distillFeedback(input);
}
