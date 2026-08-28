/** Default bid window for sourcing-agent vendor publish when dates are missing or invalid. */

export const DEFAULT_PUBLISH_OPEN_HOURS = 1;
export const DEFAULT_PUBLISH_CLOSE_DAYS = 5;
/** Days after bid close when sealed tender envelope opens by default. */
export const DEFAULT_ENVELOPE_OPEN_DAYS_AFTER_CLOSE = 1;

/**
 * Bid dates are always resolved in India Standard Time (UTC+5:30, no DST) — the
 * business's operating timezone — not the server process's OS timezone. Production
 * containers run Node with no TZ set (defaults to UTC), so building dates via local
 * Date getters/setters silently shifted "today"/explicit date-time inputs by 5.5
 * hours. These helpers anchor to IST explicitly regardless of host timezone.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Split a UTC instant into its IST wall-clock calendar/time parts (0-based month). */
export function toIstParts(date: Date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
    seconds: shifted.getUTCSeconds(),
  };
}

/** Build the UTC instant for a given IST wall-clock date/time (0-based month). */
function fromIstParts(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  seconds = 0,
  ms = 0,
): Date {
  return new Date(Date.UTC(year, month, day, hours, minutes, seconds, ms) - IST_OFFSET_MS);
}

/** IST calendar date + time-of-day, e.g. for telling an LLM "today"'s date (1-based month). */
export function getIstNowParts(now = new Date()) {
  const parts = toIstParts(now);
  return { year: parts.year, month: parts.month + 1, day: parts.day, hours: parts.hours, minutes: parts.minutes };
}

export function getDefaultPublishOpenDate(now = new Date()): Date {
  const open = new Date(now);
  open.setHours(open.getHours() + DEFAULT_PUBLISH_OPEN_HOURS);
  open.setSeconds(0, 0);
  open.setMilliseconds(0);
  return open;
}

export function getDefaultPublishCloseDate(openDate: Date): Date {
  const close = new Date(openDate);
  close.setDate(close.getDate() + DEFAULT_PUBLISH_CLOSE_DAYS);
  return close;
}

function toDateOrNull(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Parse optional time suffix like "7:30 pm", "19:30", "at 5pm". Returns null if absent. */
function parseTimeOfDay(fragment: string): { hours: number; minutes: number } | null {
  const m = fragment.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const minutes = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3]?.toLowerCase();
  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes > 59) return null;
  if (ampm) {
    if (hours < 1 || hours > 12) return null;
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }
  return { hours, minutes };
}

/** Resolve relative phrases like "today", "today 7:30 pm", "tomorrow". */
function parseRelativeDateInput(raw: string, now = new Date()): Date | null {
  const lower = raw.trim().toLowerCase();
  const dayMatch = lower.match(/^(today|tomorrow)(?:\s+(.+))?$/i);
  if (!dayMatch) return null;

  const istNow = toIstParts(now);
  const day = istNow.day + (dayMatch[1].toLowerCase() === "tomorrow" ? 1 : 0);

  const rest = (dayMatch[2] || "").trim();
  if (!rest) {
    return fromIstParts(istNow.year, istNow.month, day, 23, 59, 59, 999);
  }

  const tod = parseTimeOfDay(rest);
  if (!tod) return null;
  return fromIstParts(istNow.year, istNow.month, day, tod.hours, tod.minutes, 0, 0);
}

/**
 * Optional time of day trailing a date. Tolerates the separators people actually type —
 * "2026-07-30,16:50", "2026-07-30, 16:50", "2026-07-30 4 pm", "2026-07-30T12:30pm".
 * A comma counts as a separator on its own, so it must not require a space after it.
 * Groups: hour, minute, second, am/pm.
 */
const TRAILING_TIME = String.raw`(?:(?:\s*,\s*|[T\s]\s*)(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?)?`;
const ISO_DATE_TIME_RE = new RegExp(
  String.raw`^(\d{4})-(\d{1,2})-(\d{1,2})${TRAILING_TIME}$`,
  "i",
);
const SLASH_DATE_TIME_RE = new RegExp(
  String.raw`^(\d{1,2})\/(\d{1,2})\/(\d{2,4})${TRAILING_TIME}$`,
  "i",
);
const DASH_DATE_TIME_RE = new RegExp(
  String.raw`^(\d{1,2})-(\d{1,2})-(\d{2,4})${TRAILING_TIME}$`,
  "i",
);

/** Build a local Date from matched parts. A missing time means end of day. */
function buildDateFromParts(
  year: number,
  month: number,
  day: number,
  parts: { hour?: string; minute?: string; second?: string; ampm?: string },
): Date | null {
  if (parts.hour == null) {
    return fromIstParts(year, month - 1, day, 23, 59, 59, 999);
  }
  let hours = parseInt(parts.hour, 10);
  const minutes = parts.minute ? parseInt(parts.minute, 10) : 0;
  const seconds = parts.second ? parseInt(parts.second, 10) : 0;
  const ampm = parts.ampm?.toLowerCase();
  if (ampm) {
    if (hours < 1 || hours > 12) return null;
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
  }
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return fromIstParts(year, month - 1, day, hours, minutes, seconds, 0);
}

/** Disambiguate DD/MM vs MM/DD, defaulting to day-first when both are plausible. */
function resolveDayMonth(n1: number, n2: number): { day: number; month: number } {
  if (n1 > 12) return { day: n1, month: n2 };
  if (n2 > 12) return { day: n2, month: n1 };
  return { day: n1, month: n2 };
}

function matchedTimeParts(match: RegExpMatchArray) {
  return { hour: match[4], minute: match[5], second: match[6], ampm: match[7] };
}

/** ISO instants produced by `toISOString()` / datetime-local inputs — always carry a year. */
const ISO_INSTANT_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Parse only the unambiguous formats (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, ISO instants,
 * today/tomorrow). Natural language is deliberately NOT handled here — the agent resolves
 * that with the LLM (`bid-date-interpreter.ts`) and feeds the ISO result back through this.
 */
export function parseStrictUserDateInput(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const relative = parseRelativeDateInput(raw);
  if (relative) return relative;

  // Date() rejects an am/pm suffix, a space separator, and a comma before the time, so build
  // these explicitly (local time). ISO forms carrying a Z/offset are handled at the end.
  const isoMatch = raw.match(ISO_DATE_TIME_RE);
  if (isoMatch) {
    return buildDateFromParts(
      parseInt(isoMatch[1], 10),
      parseInt(isoMatch[2], 10),
      parseInt(isoMatch[3], 10),
      matchedTimeParts(isoMatch),
    );
  }

  const slashMatch = raw.match(SLASH_DATE_TIME_RE);
  if (slashMatch) {
    const yearPart = slashMatch[3];
    const year =
      yearPart.length === 2 ? 2000 + parseInt(yearPart, 10) : parseInt(yearPart, 10);
    const { day, month } = resolveDayMonth(
      parseInt(slashMatch[1], 10),
      parseInt(slashMatch[2], 10),
    );
    return buildDateFromParts(year, month, day, matchedTimeParts(slashMatch));
  }

  const dashMatch = raw.match(DASH_DATE_TIME_RE);
  if (dashMatch) {
    const yearPart = dashMatch[3];
    const year =
      yearPart.length === 2 ? 2000 + parseInt(yearPart, 10) : parseInt(yearPart, 10);
    const { day, month } = resolveDayMonth(
      parseInt(dashMatch[1], 10),
      parseInt(dashMatch[2], 10),
    );
    return buildDateFromParts(year, month, day, matchedTimeParts(dashMatch));
  }

  if (ISO_INSTANT_RE.test(raw)) {
    const iso = new Date(raw);
    return Number.isNaN(iso.getTime()) ? null : iso;
  }

  return null;
}

/** Parse common user date inputs (YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, ISO datetime, today/tomorrow). */
export function parseUserDateInput(value: unknown): Date | null {
  const strict = parseStrictUserDateInput(value);
  if (strict) return strict;

  const raw = String(value ?? "").trim();
  if (!raw) return null;
  // V8 resolves a year-less textual date ("aug 30") to the year 2001, which is never what the
  // user meant and surfaces as a confusing past-date error. Require a stated year here; the
  // agent's LLM interpreter is what turns year-less natural language into a real date.
  if (!/\d{4}/.test(raw)) return null;

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * True when the user actually stated a time of day, rather than just a calendar date.
 * Callers use this to ask for the time instead of silently assuming one.
 */
export function userDateInputHasTime(value: unknown): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  if (/^(?:today|tomorrow)\b/i.test(raw)) {
    return parseTimeOfDay(raw.replace(/^(?:today|tomorrow)\s*/i, "")) != null;
  }
  for (const re of [ISO_DATE_TIME_RE, SLASH_DATE_TIME_RE, DASH_DATE_TIME_RE]) {
    const match = raw.match(re);
    if (match) return match[4] != null;
  }
  // Anything else Date() understands — an ISO string with an offset, for instance.
  return /\d{1,2}:\d{2}/.test(raw) || /\b\d{1,2}\s*(?:am|pm)\b/i.test(raw);
}

/** Parse a bare time-of-day reply such as "16:50", "4pm", or "4:30 PM". */
export function parseTimeOfDayInput(
  value: unknown,
): { hours: number; minutes: number } | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(
    /^(?:at\s+)?(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?(?:\s*(?:hrs?|hours))?$/i,
  );
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3]?.toLowerCase();
  if (ampm) {
    if (hours < 1 || hours > 12) return null;
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }
  if (minutes > 59) return null;
  return { hours, minutes };
}

/** Format a Date as `YYYY-MM-DD` for echoing a date back to the user. */
export function formatDateOnly(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export type UserCloseDateInvalidReason = "unparseable" | "past" | "before_open";

export type UserCloseDateValidation =
  | { valid: true; closeDate: Date }
  | { valid: false; reason: UserCloseDateInvalidReason; userInput: string };

/** Validate a user-specified bid close date — does not apply defaults when invalid. */
export function validateUserProvidedCloseDate(options: {
  closeDate: unknown;
  openDate?: Date;
  now?: Date;
}): UserCloseDateValidation {
  const userInput = String(options.closeDate ?? "").trim();
  if (!userInput) {
    return { valid: false, reason: "unparseable", userInput };
  }

  const parsed = parseUserDateInput(userInput);
  if (!parsed) {
    return { valid: false, reason: "unparseable", userInput };
  }

  const now = options.now ?? new Date();
  if (parsed < now) {
    return { valid: false, reason: "past", userInput };
  }

  const openDate = options.openDate ?? getDefaultPublishOpenDate(now);
  if (parsed < openDate) {
    return { valid: false, reason: "before_open", userInput };
  }

  return { valid: true, closeDate: parsed };
}

export function formatInvalidCloseDateMessage(
  userInput: string,
  reason: UserCloseDateInvalidReason,
  bidType?: string | null,
): string {
  const typeHint = bidType ? ` this **${bidType}**` : "";
  const base = `The closing date you specified (**${userInput}**) `;
  switch (reason) {
    case "unparseable":
      return `${base}couldn't be understood. Please give me the closing date another way — for example **2026-12-06**, **06/12/2026**, or **6 December 2026**.`;
    case "past":
      return `${base}is in the past. The closing date must be in the future. Please provide a valid closing date for${typeHint}.`;
    case "before_open":
      return `${base}is before the bid open date. The closing date must be after the bid opens. Please provide a later closing date for${typeHint}.`;
  }
}

export type UserOpenDateInvalidReason = "unparseable" | "past";

export type UserOpenDateValidation =
  | { valid: true; openDate: Date }
  | { valid: false; reason: UserOpenDateInvalidReason; userInput: string };

/** Validate a user-specified bid open date — does not apply defaults when invalid. */
export function validateUserProvidedOpenDate(options: {
  openDate: unknown;
  now?: Date;
}): UserOpenDateValidation {
  const userInput = String(options.openDate ?? "").trim();
  if (!userInput) {
    return { valid: false, reason: "unparseable", userInput };
  }

  const parsed = parseUserDateInput(userInput);
  if (!parsed) {
    return { valid: false, reason: "unparseable", userInput };
  }

  const now = options.now ?? new Date();
  if (parsed < now) {
    return { valid: false, reason: "past", userInput };
  }

  return { valid: true, openDate: parsed };
}

export function formatInvalidOpenDateMessage(
  userInput: string,
  reason: UserOpenDateInvalidReason,
  bidType?: string | null,
): string {
  const typeHint = bidType ? ` this **${bidType}**` : "";
  const base = `The open date you specified (**${userInput}**) `;
  switch (reason) {
    case "unparseable":
      return `${base}couldn't be understood. Please give me the open date another way — for example **2026-07-30 14:30**, **30/07/2026 2:30 pm**, or **30 July 2026** for a date only.`;
    case "past":
      return `${base}is in the past. The open date must be in the future. Please provide a valid open date and time for${typeHint}.`;
  }
}

export const PAST_OPEN_DATE_MESSAGE =
  "The Open Date you selected is in the past. Please choose a future date.";
export const PAST_CLOSE_DATE_MESSAGE =
  "The Close Date you selected is in the past. Please choose a future date.";

export interface ResolvedPublishDates {
  openDate: Date;
  closeDate: Date;
  datesRequireUpdate: boolean;
  /** Stored open date exists but is in the past — the caller should report it, not hide it. */
  openDateInPast: boolean;
  /** Stored close date exists but is in the past. */
  closeDateInPast: boolean;
}

/** Resolve publish open/close dates, filling defaults when missing or in the past. */
export function resolveDefaultPublishDates(options?: {
  openDate?: string | Date | null;
  closeDate?: string | Date | null;
  now?: Date;
  /**
   * Keep a stored-but-past date instead of substituting a default. Read paths that show
   * dates back to the user set this so a rejected date can be reported and corrected;
   * write paths (create bid) leave it off so they never persist a past date.
   */
  preservePastDates?: boolean;
}): ResolvedPublishDates {
  const now = options?.now ?? new Date();
  const preserve = options?.preservePastDates === true;
  const defaultOpen = getDefaultPublishOpenDate(now);

  const storedOpen = toDateOrNull(options?.openDate);
  const openDateInPast = storedOpen != null && storedOpen < now;
  const open =
    storedOpen != null && (!openDateInPast || preserve) ? storedOpen : defaultOpen;
  const needsOpenUpdate = storedOpen == null || openDateInPast;

  const storedClose = toDateOrNull(options?.closeDate);
  const closeDateInPast = storedClose != null && storedClose < now;
  const closeValid = storedClose != null && !closeDateInPast && storedClose >= open;
  // Derive a default close from a usable open so we never suggest a close in the past.
  const close =
    closeValid || (closeDateInPast && preserve)
      ? storedClose!
      : getDefaultPublishCloseDate(needsOpenUpdate ? defaultOpen : open);

  return {
    openDate: open,
    closeDate: close,
    datesRequireUpdate: needsOpenUpdate || !closeValid,
    openDateInPast,
    closeDateInPast,
  };
}

/** Default envelope open date for Tender bids — strictly after the bid close date. */
export function getDefaultEnvelopeOpenDate(closeDate: Date): Date {
  const envelope = new Date(closeDate);
  envelope.setDate(envelope.getDate() + DEFAULT_ENVELOPE_OPEN_DAYS_AFTER_CLOSE);
  return envelope;
}

/** Use provided envelope open date when valid (after close); otherwise default to close + 1 day. */
export function resolveDefaultEnvelopeOpenDate(options: {
  envelopeOpenDate?: string | Date | null;
  closeDate: Date;
}): Date {
  const close = options.closeDate;
  const raw = options.envelopeOpenDate ? new Date(options.envelopeOpenDate) : null;
  if (raw && !Number.isNaN(raw.getTime()) && raw > close) {
    return raw;
  }
  return getDefaultEnvelopeOpenDate(close);
}

/** Format a Date as `YYYY-MM-DDTHH:mm` for datetime-local inputs anchored to IST wall-clock time. */
export function formatPublishDateTimeLocal(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const parts = toIstParts(date);
  return `${parts.year}-${pad(parts.month + 1)}-${pad(parts.day)}T${pad(
    parts.hours,
  )}:${pad(parts.minutes)}`;
}

const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Format a Date or date string as `DD MMM YYYY, hh:mm A` anchored to IST wall-clock time. */
export function formatDateTimeDisplay(dateInput: Date | string | null | undefined): string {
  if (!dateInput) return "-";
  const d = dateInput instanceof Date ? dateInput : new Date(String(dateInput));
  if (Number.isNaN(d.getTime())) return String(dateInput);
  const parts = toIstParts(d);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const day = pad(parts.day);
  const month = MONTH_NAMES_SHORT[parts.month] || "";
  const year = parts.year;
  const hours24 = parts.hours;
  const minutes = pad(parts.minutes);
  const ampm = hours24 >= 12 ? "PM" : "AM";
  const hours12 = pad(hours24 % 12 === 0 ? 12 : hours24 % 12);
  return `${day} ${month} ${year}, ${hours12}:${minutes} ${ampm}`;
}
