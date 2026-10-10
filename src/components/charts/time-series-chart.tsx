"use client";

import { CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { formatAxis, formatMonthIndex, formatValue, type ValueFormat } from "./format";

export const CHART_COLORS = ["#19625b", "#f19414", "#3b6fd8", "#b5446e", "#6b8e23", "#7a5af8", "#0e9384", "#c4320a"];

export interface TimeSeries {
  name: string;
  /** x = month index (months since 1990-01) */
  points: { x: number; y: number }[];
  color?: string;
  /** "line" (default) for medians/indices, "scatter" for individual sales */
  kind?: "line" | "scatter";
}

/**
 * Month-indexed chart for price history, indices and trend lines. Server components can render it
 * directly: every prop is serializable.
 */
export function TimeSeriesChart({ series, yFormat = "sgd", height = 280, ariaLabel }: { series: TimeSeries[]; yFormat?: ValueFormat; height?: number; ariaLabel: string }) {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return <div className="flex items-center justify-center text-sm text-muted" style={{ height }}>No data to chart.</div>;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of all) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  }
  return (
    <div role="img" aria-label={ariaLabel} style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="#e3e8e7" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="x"
            type="number"
            domain={[minX, maxX]}
            tickFormatter={(v: number) => formatMonthIndex(Math.round(v))}
            tick={{ fontSize: 12, fill: "#5b6b68" }}
            minTickGap={40}
            allowDuplicatedCategory={false}
          />
          <YAxis dataKey="y" type="number" width={64} tickFormatter={(v: number) => formatAxis(v, yFormat)} tick={{ fontSize: 12, fill: "#5b6b68" }} domain={["auto", "auto"]} />
          <Tooltip
            formatter={(v) => formatValue(Number(v), yFormat)}
            labelFormatter={(v) => formatMonthIndex(Math.round(Number(v)))}
            contentStyle={{ borderRadius: 10, borderColor: "#e3e8e7", fontSize: 13 }}
          />
          {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
          {series.map((s, i) =>
            s.kind === "scatter" ? (
              <Scatter key={s.name} name={s.name} data={s.points} fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.45} isAnimationActive={false} />
            ) : (
              <Line key={s.name} name={s.name} data={s.points} dataKey="y" type="monotone" stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} isAnimationActive={false} />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
