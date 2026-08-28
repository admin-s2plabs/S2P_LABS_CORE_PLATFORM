/**
 * Shared list pagination helpers.
 * limit=0 means "return all matching rows" (used by list exports).
 */

export function parseListPageLimit(
  pageRaw: string | number | undefined | null,
  limitRaw: string | number | undefined | null,
  defaults?: { page: number; limit: number },
): { page: number; limit: number; offset: number } {
  const defaultPage = defaults?.page ?? 1;
  const defaultLimit = defaults?.limit ?? 50;

  const pageParsed = parseInt(String(pageRaw ?? ""), 10);
  const page =
    Number.isFinite(pageParsed) && pageParsed > 0 ? pageParsed : defaultPage;

  if (limitRaw === undefined || limitRaw === null || limitRaw === "") {
    const limit = defaultLimit;
    return { page, limit, offset: (page - 1) * limit };
  }

  const limitParsed = parseInt(String(limitRaw), 10);
  if (!Number.isFinite(limitParsed) || limitParsed < 0) {
    const limit = defaultLimit;
    return { page, limit, offset: (page - 1) * limit };
  }

  const limit = limitParsed;
  const offset = limit === 0 ? 0 : (page - 1) * limit;
  return { page, limit, offset };
}

export function isExportAllRows(exportLinesRaw: unknown, limit: number): boolean {
  const requested =
    exportLinesRaw === true ||
    exportLinesRaw === "true" ||
    exportLinesRaw === "1" ||
    exportLinesRaw === 1 ||
    exportLinesRaw === "yes";
  return requested && limit === 0;
}

export function listPaginationMeta(total: number, page: number, limit: number) {
  return {
    page,
    limit,
    total,
    totalPages: limit <= 0 ? 1 : Math.max(1, Math.ceil(total / limit)),
  };
}
