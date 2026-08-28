/**
 * Optional chart payload for AI console agent responses.
 * Built deterministically from tool results (not from model prose).
 */

export type AgentChartKind = "bar" | "pie" | "line";

export interface AgentChartSeries {
  key: string;
  label?: string;
}

export interface AgentChartSpec {
  kind: AgentChartKind;
  title?: string;
  /** Row field used as category / X-axis label */
  xKey: string;
  series: AgentChartSeries[];
  rows: Record<string, string | number>[];
}

const DEFAULT_MIN_SEGMENTS = 2;

/** Tools that must never co-occur with an analytics chart in the same turn. */
export function agentToolIsMutatingForChartGate(toolName: string): boolean {
  return (
    toolName.startsWith("prepare_") ||
    toolName.startsWith("execute_") ||
    toolName === "request_vendor_selection"
  );
}

/**
 * Vertical bar chart from a label → count map.
 * Returns undefined if fewer than `minSegments` categories have a positive count.
 */
export function barChartFromCountMap(
  title: string | undefined,
  counts: Record<string, number>,
  options?: {
    minSegments?: number;
    valueSeriesLabel?: string;
    maxCategories?: number;
  }
): AgentChartSpec | undefined {
  const minSeg = options?.minSegments ?? DEFAULT_MIN_SEGMENTS;
  const maxCat = options?.maxCategories ?? 24;
  let entries = Object.entries(counts).filter(([, v]) => (Number(v) || 0) > 0);
  if (entries.length < minSeg) return undefined;
  entries.sort((a, b) => b[1] - a[1]);
  if (entries.length > maxCat) entries = entries.slice(0, maxCat);

  const categoryKey = "label";
  const valueKey = "value";

  return {
    kind: "bar",
    title,
    xKey: categoryKey,
    series: [{ key: valueKey, label: options?.valueSeriesLabel ?? "Count" }],
    rows: entries.map(([name, value]) => ({
      [categoryKey]: name,
      [valueKey]: value,
    })),
  };
}
