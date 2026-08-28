// Semicircle margin gauge for the Should Cost Intelligence agent's
// "Margin Gauge" card. Ported from the Figma reference (MarginGauge.tsx) —
// a Recharts Pie sliced into a 210°→-30° arc.
import { PieChart, Pie, ResponsiveContainer } from "recharts";

export function MarginGauge({ value, label }: { value: number; label: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  const data = [
    { value: clamped, fill: "#1e3a5f" },
    { value: 100 - clamped, fill: "#dceef6" },
  ];

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-[140px] h-[90px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="85%"
              startAngle={210}
              endAngle={-30}
              innerRadius={48}
              outerRadius={62}
              dataKey="value"
              stroke="none"
              isAnimationActive={false}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-center">
          <div className="font-['Google_Sans'] text-[1.05rem] font-medium text-[#1a1a18] leading-none">
            {clamped}%
          </div>
        </div>
      </div>
      <div className="font-['Google_Sans'] text-[0.58rem] text-[#7a7a72] uppercase tracking-[0.08em]">
        {label}
      </div>
    </div>
  );
}
