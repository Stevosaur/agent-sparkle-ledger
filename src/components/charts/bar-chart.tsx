"use client";

import { Bar, BarChart as RBarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatAxis, formatValue, type ValueFormat } from "./format";
import { CHART_COLORS } from "./time-series-chart";

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

/** Simple categorical bar chart (e.g. units by year, median price by flat type). */
export function SimpleBarChart({ data, yFormat = "int", height = 240, ariaLabel, color }: { data: BarDatum[]; yFormat?: ValueFormat; height?: number; ariaLabel: string; color?: string }) {
  if (data.length === 0) return <div className="flex items-center justify-center text-sm text-muted" style={{ height }}>No data to chart.</div>;
  return (
    <div role="img" aria-label={ariaLabel} style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RBarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="#e3e8e7" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#5b6b68" }} interval="preserveStartEnd" />
          <YAxis width={64} tickFormatter={(v: number) => formatAxis(v, yFormat)} tick={{ fontSize: 12, fill: "#5b6b68" }} />
          <Tooltip formatter={(v) => formatValue(Number(v), yFormat)} contentStyle={{ borderRadius: 10, borderColor: "#e3e8e7", fontSize: 13 }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={`${d.label}-${i}`} fill={d.color ?? color ?? CHART_COLORS[0]} />
            ))}
          </Bar>
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}
