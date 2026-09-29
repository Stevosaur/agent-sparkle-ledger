"use client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { date: string; buy: number; sell: number | null; ask: number | null; kg: number };

const SERIES = [
  { key: "buy", label: "Buy (weighted avg)", color: "var(--viz-1)", dash: undefined },
  { key: "ask", label: "Supplier asking", color: "var(--viz-2)", dash: "5 4" },
  { key: "sell", label: "Sell (weighted avg)", color: "var(--viz-3)", dash: undefined },
] as const;

const fmtDay = (d: string) => new Date(`${d}T04:00:00Z`).toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Singapore" });

/** Buy / asking / sell price per kg over time. One y-axis (S$/kg), legend always visible, table view on the page. */
export function PriceChart({ points }: { points: Point[] }) {
  return (
    <div className="pc-viz">
      {/* Categorical slots 1–3, validated for both surfaces (light warns on contrast → legend + table view provided). */}
      <style>{`.pc-viz{--viz-1:#2a78d6;--viz-2:#eb6834;--viz-3:#1baf7a}.dark .pc-viz{--viz-1:#3987e5;--viz-2:#d95926;--viz-3:#199e70}`}</style>
      <div className="mb-2 flex flex-wrap gap-4 text-[11px] text-text-2" aria-hidden>
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} /></svg>
            {s.label}
          </span>
        ))}
      </div>
      <div className="h-64 w-full" role="img" aria-label="Purchase, asking and selling price per kg by market night">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} minTickGap={24} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => `$${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(2)}`} domain={["auto", "auto"]} />
            <Tooltip
              cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as Point;
                return (
                  <div className="rounded-lg border border-border bg-panel px-3 py-2 text-xs shadow-xl">
                    <div className="mb-1 font-medium text-text">{fmtDay(String(label))}</div>
                    {SERIES.map((s) => {
                      const v = p[s.key];
                      return (
                        <div key={s.key} className="flex items-center gap-2 text-text-2">
                          <span className="size-2 rounded-full" style={{ background: s.color }} />
                          <span className="flex-1">{s.label}</span>
                          <span className="num text-text">{v === null ? "—" : `S$${v.toFixed(2)}`}</span>
                        </div>
                      );
                    })}
                    <div className="num mt-1 text-[10px] text-muted">{p.kg.toFixed(1)} kg bought</div>
                  </div>
                );
              }}
            />
            {SERIES.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--panel)" }} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
