import {
  getIstNowParts,
  parseStrictUserDateInput,
  toIstParts,
  userDateInputHasTime,
} from "@shared/publish-bid-dates";

import { getAIClient, getAIModelName } from "./ai-client";

export type BidDateField = "open" | "close";

export type InterpretedBidDate =
  /** A real instant. `hasTime` is false when the user named a day but no time of day. */
  | { status: "resolved"; date: Date; hasTime: boolean; source: "format" | "llm" }
  /** Genuinely ambiguous — ask rather than guess a deadline. */
  | { status: "clarify"; question: string }
  /** Not a date at all, or the model is unavailable — callers fall back to their own error. */
  | { status: "unresolved" };

interface InterpretOptions {
  field: BidDateField;
  /** The bid's open date, so "a week after it opens" style phrasing can be resolved. */
  openDate?: Date | null;
  now?: Date;
}

const MIN_CONFIDENCE = 0.6;
/** A bid window years out is a hallucinated year, not a deadline anyone typed. */
const MAX_YEARS_AHEAD = 5;
const CACHE_LIMIT = 200;

/**
 * One phrase resolves to the same date for the whole of an IST day, and a single turn can
 * interpret the same value several times (missing-time ask, staged patch, tool re-validation).
 */
const cache = new Map<string, InterpretedBidDate>();

function cacheKey(raw: string, options: InterpretOptions, now: Date): string {
  const ist = toIstParts(now);
  const day = `${ist.year}-${ist.month + 1}-${ist.day}`;
  const open = options.openDate ? options.openDate.toISOString() : "-";
  return `${options.field}|${day}|${open}|${raw.toLowerCase()}`;
}

/** Dates are mutable, so hand every caller its own copy. */
function cloneResult(result: InterpretedBidDate): InterpretedBidDate {
  return result.status === "resolved"
    ? { ...result, date: new Date(result.date.getTime()) }
    : result;
}

function rememberResult(key: string, result: InterpretedBidDate): InterpretedBidDate {
  if (result.status !== "unresolved") {
    if (cache.size >= CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, result);
  }
  return cloneResult(result);
}

function optionalQuestion(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().slice(0, 400);
  return text || undefined;
}

/**
 * The model is told to pick a future occurrence when the user omits the year, but a slip there
 * silently books last year's deadline. Only nudge values the user never pinned a year on.
 */
function rollYearForward(date: Date, raw: string, now: Date): Date {
  if (/\d{4}/.test(raw)) return date;
  if (date >= now) return date;
  const rolled = new Date(date.getTime());
  rolled.setFullYear(rolled.getFullYear() + 1);
  return rolled >= now ? rolled : date;
}

function buildSystemPrompt(field: BidDateField, now: Date, openDate?: Date | null): string {
  const ist = getIstNowParts(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  const today = `${ist.year}-${pad(ist.month)}-${pad(ist.day)}`;
  const clock = `${pad(ist.hours)}:${pad(ist.minutes)}`;
  const label = field === "open" ? "opens" : "closes";
  const openLine = openDate
    ? `\nThe bid opens at ${openDate.toISOString()} (UTC). A ${field} date must be after that.`
    : "";

  return `You convert what a procurement user typed for the date a bid ${label} into a calendar date.

Today is ${today} and the current time is ${clock}, in India Standard Time (UTC+05:30). All dates you return are IST wall-clock values.${openLine}

Return exactly one JSON object:
{
  "date": "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" or null,
  "hasTime": true or false,
  "confidence": 0.0,
  "needsClarification": false,
  "question": null
}

Rules:
- Read the input the way a person would: "aug30", "30 aug", "30th August", "Aug 30 2026", "next Friday", "end of this month", "in two weeks", "tomorrow 5pm" are all real dates.
- Never take a year from memory. When the user does not state a year, pick the next occurrence that is still in the future relative to today.
- Set "hasTime" true only when the user actually stated a time of day, and then include it in "date" as 24-hour HH:mm. Otherwise return a date only and leave "hasTime" false.
- Set "confidence" to how sure you are that this is the date the user meant.
- Set "needsClarification" true and write a short "question" only when the input has two genuinely different readings a reasonable person could not choose between (for example "next weekend", or a day that has already passed this year with no year given). A deadline is being set, so ask instead of guessing.
- If the input is not a date at all, return "date": null with "confidence": 0.
- Return only the JSON object.`;
}

/**
 * Turn whatever the user typed for a bid open/close date into an instant.
 *
 * Unambiguous formats are parsed in-process; everything else goes to the model, because
 * understanding "aug30" or "end of the month" is language, not validation. Callers still
 * run the resolved date through `validateUserProvidedOpenDate` / `validateUserProvidedCloseDate`
 * — the model interprets, the app decides whether the result is an acceptable deadline.
 */
export async function interpretBidDateInput(
  rawInput: unknown,
  options: InterpretOptions,
): Promise<InterpretedBidDate> {
  const raw = String(rawInput ?? "").trim();
  if (!raw) return { status: "unresolved" };

  const now = options.now ?? new Date();

  const strict = parseStrictUserDateInput(raw);
  if (strict) {
    return { status: "resolved", date: strict, hasTime: userDateInputHasTime(raw), source: "format" };
  }

  const key = cacheKey(raw, options, now);
  const cached = cache.get(key);
  if (cached) return cloneResult(cached);

  try {
    const openai = await getAIClient();
    const model = await getAIModelName();
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt(options.field, now, options.openDate) },
        { role: "user", content: raw },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return { status: "unresolved" };
    const parsed = JSON.parse(content) as Record<string, unknown>;

    const question = optionalQuestion(parsed.question);
    if (parsed.needsClarification === true && question) {
      return rememberResult(key, { status: "clarify", question });
    }

    const confidence = Number(parsed.confidence);
    if (!Number.isFinite(confidence) || confidence < MIN_CONFIDENCE) {
      return { status: "unresolved" };
    }

    const resolvedText = typeof parsed.date === "string" ? parsed.date.trim() : "";
    const resolved = parseStrictUserDateInput(resolvedText);
    if (!resolved) return { status: "unresolved" };

    const date = rollYearForward(resolved, raw, now);
    const maxAhead = new Date(now.getTime());
    maxAhead.setFullYear(maxAhead.getFullYear() + MAX_YEARS_AHEAD);
    if (date > maxAhead) return { status: "unresolved" };

    const hasTime = parsed.hasTime === true && userDateInputHasTime(resolvedText);
    console.log(
      `[Bid Date Interpreter] field=${options.field} input=${JSON.stringify(raw)} -> ${date.toISOString()} hasTime=${hasTime} confidence=${confidence.toFixed(2)}`,
    );
    return rememberResult(key, { status: "resolved", date, hasTime, source: "llm" });
  } catch (error) {
    console.warn(
      "[Bid Date Interpreter] interpretation failed; falling back to format validation:",
      error instanceof Error ? error.message : String(error),
    );
    return { status: "unresolved" };
  }
}
