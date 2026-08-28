/**
 * Parse chat follow-ups that edit an open Direct PO recommendation
 * ("change vendor to …", "change date to 20th june") into structured overrides.
 */

export interface ParsedPoChatOverrides {
  supplierName?: string;
  needByDateRaw?: string;
  quantity?: number;
}

const MONTHS: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

function trimName(value: string): string {
  return value
    .replace(/^@+/, "")
    .replace(/[.?!,"']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parsePoChatOverrides(prompt: string): ParsedPoChatOverrides {
  const text = String(prompt || "").trim();
  if (!text) return {};

  const out: ParsedPoChatOverrides = {};

  // "change supplier to Acme" | "change the supplier HCL as supplier" |
  // "set supplier as HCL" | "use HCL as supplier"
  const vendorRaw =
    text.match(
      /(?:change|set|update|switch)\s+(?:the\s+)?(?:vendor|supplier)\s+to\s+(.+?)(?:\s+and\s+|\s*$)/i,
    )?.[1] ||
    text.match(
      /(?:change|set|update|switch)\s+(?:the\s+)?(?:vendor|supplier)\s+(.+?)\s+as\s+(?:the\s+)?(?:vendor|supplier)\s*$/i,
    )?.[1] ||
    text.match(
      /(?:change|set|update|switch)\s+(?:the\s+)?(?:vendor|supplier)\s+as\s+(.+?)(?:\s+and\s+|\s*$)/i,
    )?.[1] ||
    text.match(
      /(?:set|use|make)\s+(.+?)\s+as\s+(?:the\s+)?(?:vendor|supplier)\s*$/i,
    )?.[1];
  if (vendorRaw) out.supplierName = trimName(vendorRaw);

  const dateMatch = text.match(
    /(?:change|set|update)\s+(?:the\s+)?(?:need\s*by\s*)?date\s+to\s+(.+?)(?:\s+and\s+|\s*$)/i,
  ) || text.match(
    /need\s*by(?:\s+date)?\s+to\s+(.+?)(?:\s+and\s+|\s*$)/i,
  );
  if (dateMatch?.[1]) out.needByDateRaw = trimName(dateMatch[1]);

  const qtyMatch = text.match(
    /(?:change|set|update)\s+(?:the\s+)?(?:qty|quantity)\s+to\s+(\d+)/i,
  );
  if (qtyMatch?.[1]) {
    const qty = Number(qtyMatch[1]);
    if (Number.isFinite(qty) && qty > 0) out.quantity = qty;
  }

  return out;
}

export function hasPoChatOverrides(parsed: ParsedPoChatOverrides): boolean {
  return !!(parsed.supplierName || parsed.needByDateRaw || parsed.quantity != null);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toIso(year: number, monthIndex: number, day: number): string | null {
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, monthIndex, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== monthIndex || dt.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

/** Parse a user date phrase into YYYY-MM-DD. Past dates without a year roll to next year. */
export function parseNeedByDate(raw: string, now: Date = new Date()): string | null {
  const text = trimName(raw).toLowerCase();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return toIso(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return toIso(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));

  const ordinalDay = text.replace(/(\d+)(st|nd|rd|th)/g, "$1");
  const monthFirst = ordinalDay.match(
    /^([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/,
  );
  const dayFirst = ordinalDay.match(
    /^(\d{1,2})\s+([a-z]+)(?:,?\s+(\d{4}))?$/,
  );

  let year: number | null = null;
  let monthIndex: number | null = null;
  let day: number | null = null;

  if (monthFirst) {
    monthIndex = MONTHS[monthFirst[1]];
    day = Number(monthFirst[2]);
    year = monthFirst[3] ? Number(monthFirst[3]) : now.getFullYear();
  } else if (dayFirst) {
    day = Number(dayFirst[1]);
    monthIndex = MONTHS[dayFirst[2]];
    year = dayFirst[3] ? Number(dayFirst[3]) : now.getFullYear();
  }

  if (year == null || monthIndex == null || day == null || Number.isNaN(monthIndex)) return null;

  let isoDate = toIso(year, monthIndex, day);
  if (!isoDate) return null;

  if (!monthFirst?.[3] && !dayFirst?.[3]) {
    const startToday = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const chosen = Date.UTC(year, monthIndex, day);
    if (chosen < startToday) {
      isoDate = toIso(year + 1, monthIndex, day);
    }
  }
  return isoDate;
}
