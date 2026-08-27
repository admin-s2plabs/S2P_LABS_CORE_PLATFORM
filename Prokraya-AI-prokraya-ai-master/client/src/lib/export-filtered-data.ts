import { apiRequest } from "@/lib/queryClient";

export type ListExportFilters = {
  status?: string;
  search?: string;
  extra?: Record<string, string | undefined>;
};

export type ExportToastHandlers = {
  toast: (opts: {
    title: string;
    description?: string;
    variant?: "default" | "destructive";
  }) => void;
};

export function appendListExportFilters(
  params: URLSearchParams,
  filters: ListExportFilters,
): void {
  if (filters.status && filters.status !== "all") {
    params.set("status", filters.status);
  }
  const trimmed = (filters.search ?? "").trim();
  if (trimmed) params.set("search", trimmed);
  if (filters.extra) {
    for (const [key, value] of Object.entries(filters.extra)) {
      if (value !== undefined && value !== "") {
        params.set(key, value);
      }
    }
  }
}

export function buildListExportParams(
  filters: ListExportFilters,
  options?: { page?: number; limit?: number; exportLines?: boolean },
): URLSearchParams {
  const params = new URLSearchParams();
  appendListExportFilters(params, filters);
  params.set("page", String(options?.page ?? 1));
  params.set("limit", String(options?.limit ?? 0));
  if (options?.exportLines) params.set("exportLines", "true");
  return params;
}

export async function fetchFilteredListExport<T>(
  apiPath: string,
  params: URLSearchParams,
): Promise<T> {
  const res = await apiRequest("GET", `${apiPath}?${params.toString()}`);
  return res.json() as Promise<T>;
}

export function buildExportFilterSummaryRows(meta: {
  recordCount: number;
  entries: { label: string; value: string }[];
}): { Metric: string; Value: string | number }[] {
  return [
    ...meta.entries.map((e) => ({ Metric: e.label, Value: e.value })),
    { Metric: "Records exported", Value: meta.recordCount },
  ];
}

export async function runFilteredExport(
  job: () => Promise<void>,
  handlers: ExportToastHandlers,
  setExporting?: (v: boolean) => void,
): Promise<void> {
  setExporting?.(true);
  try {
    await job();
  } catch (err) {
    handlers.toast({
      title: "Export failed",
      description: err instanceof Error ? err.message : "Could not export data",
      variant: "destructive",
    });
  } finally {
    setExporting?.(false);
  }
}

export function notifyNoExportData(
  handlers: ExportToastHandlers,
  entityLabel = "records",
): void {
  handlers.toast({
    title: "No data to export",
    description: `No ${entityLabel} match the current filters.`,
    variant: "destructive",
  });
}

type PaginatedApiResult = {
  data?: unknown[];
  pagination?: { total?: number; totalPages?: number };
};

/** Fetch every row for the current list filters (paged API). */
export async function fetchAllFilteredPages<T extends PaginatedApiResult>(
  apiPath: string,
  buildParams: (page: number, limit: number) => URLSearchParams,
  pageSize = 200,
): Promise<NonNullable<T["data"]>> {
  const all: NonNullable<T["data"]> = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const result = await fetchFilteredListExport<T>(apiPath, buildParams(page, pageSize));
    const rows = result.data ?? [];
    all.push(...rows);
    const total = result.pagination?.total;
    hasMore =
      total != null ? all.length < total : rows.length === pageSize;
    page++;
  }

  return all;
}
