"use client";

import type { AgentChartSpec } from "@shared/agent-chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const FILL = "hsl(var(--chart-1))";
const LINE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];
const PIE_COLORS = LINE_COLORS;

function formatTooltipValue(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) return v.toLocaleString();
  return String(v ?? "");
}

export function AgentChartMessage({ spec }: { spec: AgentChartSpec }) {
  if (!spec.rows?.length) return null;

  const useVertical = spec.rows.length > 7;
  const valueKey = spec.series[0]?.key ?? "value";

  if (spec.kind === "pie") {
    const data = spec.rows.map((row) => ({
      name: String(row[spec.xKey] ?? ""),
      value: Number(row[valueKey]) || 0,
    }));
    return (
      <div className="mt-3 rounded-md border border-border/60 bg-background/50 p-2">
        {spec.title ? (
          <p className="text-xs font-medium text-muted-foreground mb-2 px-1">{spec.title}</p>
        ) : null}
        <div className="h-[200px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 8, bottom: 8 }}>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={72}
                paddingAngle={2}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => formatTooltipValue(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
          {data.map((d, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <div
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
              />
              <span>{d.name}</span>
              <span>({formatTooltipValue(d.value)})</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (spec.kind === "line") {
    return (
      <div className="mt-3 rounded-md border border-border/60 bg-background/50 p-2">
        {spec.title ? (
          <p className="text-xs font-medium text-muted-foreground mb-2 px-1">{spec.title}</p>
        ) : null}
        <div className="h-[220px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spec.rows} margin={{ left: 4, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
              <XAxis
                dataKey={spec.xKey}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
              <Tooltip
                formatter={(v: number) => formatTooltipValue(v)}
                labelFormatter={(label) => String(label)}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              {spec.series.map((s, i) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name={s.label || s.key}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-border/60 bg-background/50 p-2">
      {spec.title ? (
        <p className="text-xs font-medium text-muted-foreground mb-2 px-1">{spec.title}</p>
      ) : null}
      <div className="h-[220px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          {useVertical ? (
            <BarChart layout="vertical" data={spec.rows} margin={{ left: 4, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal className="stroke-border/50" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis
                type="category"
                dataKey={spec.xKey}
                width={96}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(v: number) => formatTooltipValue(v)}
                labelFormatter={(label) => String(label)}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              {spec.series.map((s) => (
                <Bar key={s.key} dataKey={s.key} fill={FILL} radius={[0, 4, 4, 0]} name={s.label || s.key} />
              ))}
            </BarChart>
          ) : (
            <BarChart data={spec.rows} margin={{ left: 4, right: 8, top: 8, bottom: 52 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
              <XAxis
                dataKey={spec.xKey}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval={0}
                angle={-22}
                textAnchor="end"
                height={48}
              />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
              <Tooltip
                formatter={(v: number) => formatTooltipValue(v)}
                labelFormatter={(label) => String(label)}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              {spec.series.map((s) => (
                <Bar key={s.key} dataKey={s.key} fill={FILL} radius={[4, 4, 0, 0]} name={s.label || s.key} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
