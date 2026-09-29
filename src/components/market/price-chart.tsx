"use client";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type P = { date: string; buy: number; lo: number; hi: number; sell: number | null; ask: number | null };

/** Purchase price history (weighted avg with min–max band), selling and asking prices — platform data only. */
export function PriceChart({ points }: { points: P[] }) {
  const data = points.map((p) => ({ ...p, band: [p.lo, p.hi] as [number, number], d: p.date.slice(5) }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="d" tick={{ fill: "var(--muted)", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={24} />
          <YAxis tick={{ fill: "var(--muted)", fontSize: 10 }} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `$${v.toFixed(0)}`} domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text)" }}
            formatter={(v, n) => (Array.isArray(v) ? [`S$${Number(v[0]).toFixed(2)}–${Number(v[1]).toFixed(2)}`, "Range paid"] : [`S$${Number(v).toFixed(2)}/kg`, String(n)])}
          />
          <Area dataKey="band" stroke="none" fill="var(--accent)" fillOpacity={0.1} name="Range paid" isAnimationActive={false} />
          <Line dataKey="buy" stroke="var(--accent)" strokeWidth={2} dot={false} name="Paid (w. avg)" isAnimationActive={false} />
          <Line dataKey="sell" stroke="var(--ok)" strokeWidth={1.5} dot={false} name="Sold (w. avg)" connectNulls isAnimationActive={false} />
          <Line dataKey="ask" stroke="var(--surplus)" strokeWidth={1} strokeDasharray="4 3" dot={false} name="Asking (avg)" connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
