"use client";

import { useId, useMemo, useState } from "react";
import { compass, sunPathForDay } from "@/lib/calc/sun";
import { SUN_DAYS } from "@/lib/private-insights";
import { useT } from "@/lib/i18n/provider";

const COLORS: Record<(typeof SUN_DAYS)[number]["key"], string> = { mar: "#19625b", jun: "#f19414", dec: "#3b6fd8" };
const SIZE = 300;
const C = SIZE / 2;
const R = 120;
const STEP = 15;
const MIN_T = 7 * 60;
const MAX_T = 19 * 60 + 30;
const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function toXY(azimuth: number, altitude: number): { x: number; y: number } {
  const r = (R * (90 - Math.max(0, altitude))) / 90;
  const a = (azimuth * Math.PI) / 180;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
}

function hhmm(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/**
 * Polar sun-path diagram: centre = directly overhead, edge = horizon, north up. Paths for 21 Mar, 21 Jun and
 * 21 Dec at the given coordinates; afternoon (from 15:00) drawn thicker. A time slider marks the sun's position.
 */
export function SunPathDiagram({ lat, lng, year }: { lat: number; lng: number; year: number }) {
  const t = useT();
  const titleId = useId();
  const descId = useId();
  const sliderId = useId();
  const [time, setTime] = useState(15 * 60);
  const paths = useMemo(
    () => SUN_DAYS.map((d) => ({ ...d, points: sunPathForDay(year, d.month, d.day, lat, lng, STEP) })),
    [lat, lng, year],
  );
  const label = hhmm(time);
  const at = paths.map((p) => {
    const point = p.points.find((x) => x.time === label) ?? null;
    return { key: p.key, label: p.label, point, xy: point ? toXY(point.azimuth, point.altitude) : null };
  });

  return (
    <div className="grid items-start gap-6 md:grid-cols-[minmax(0,320px)_1fr]">
      <svg viewBox={`-24 -24 ${SIZE + 48} ${SIZE + 48}`} className="mx-auto w-full max-w-[320px]" role="img" aria-labelledby={`${titleId} ${descId}`}>
        <title id={titleId}>{t("private.sun.svgTitle", "Sun path diagram")}</title>
        <desc id={descId}>
          {t("private.sun.svgDesc", "The sun's path across the sky on 21 March, 21 June and 21 December at this location. Centre is directly overhead, the edge is the horizon, north is up.")}
        </desc>
        <circle cx={C} cy={C} r={R} fill="#f6f8f7" stroke="#c9d3d1" />
        {[30, 60].map((alt) => (
          <g key={alt}>
            <circle cx={C} cy={C} r={(R * (90 - alt)) / 90} fill="none" stroke="#dbe3e1" strokeDasharray="3 3" />
            <text x={C + 3} y={C - (R * (90 - alt)) / 90 - 3} fontSize="9" fill="#5b6b68">
              {alt}°
            </text>
          </g>
        ))}
        {DIRS.map((d, i) => {
          const a = (i * 45 * Math.PI) / 180;
          const lx = C + (R + 13) * Math.sin(a);
          const ly = C - (R + 13) * Math.cos(a);
          return (
            <g key={d}>
              <line x1={C} y1={C} x2={C + R * Math.sin(a)} y2={C - R * Math.cos(a)} stroke="#e3e8e7" />
              <text x={lx} y={ly} fontSize={d.length === 1 ? 12 : 10} fontWeight={d.length === 1 ? 600 : 400} fill="#0f1d1b" textAnchor="middle" dominantBaseline="central">
                {d}
              </text>
            </g>
          );
        })}
        {paths.map((p) => {
          const all = p.points.map((x) => toXY(x.azimuth, x.altitude));
          const pm = p.points.filter((x) => x.time >= "15:00").map((x) => toXY(x.azimuth, x.altitude));
          return (
            <g key={p.key}>
              <polyline points={all.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")} fill="none" stroke={COLORS[p.key]} strokeWidth={1.75} strokeLinejoin="round" />
              {pm.length > 1 ? (
                <polyline points={pm.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")} fill="none" stroke={COLORS[p.key]} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
              ) : null}
            </g>
          );
        })}
        {at.map((a) => (a.xy ? <circle key={a.key} cx={a.xy.x} cy={a.xy.y} r={6} fill={COLORS[a.key]} stroke="#fff" strokeWidth={2} /> : null))}
      </svg>

      <div className="min-w-0 space-y-4">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label={t("private.sun.legend", "Dates")}>
          {SUN_DAYS.map((d) => (
            <li key={d.key} className="flex items-center gap-1.5">
              <span className="inline-block h-1 w-5 rounded-full" style={{ background: COLORS[d.key] }} aria-hidden />
              {t(`private.sun.day.${d.key}`, d.label)}
            </li>
          ))}
          <li className="flex items-center gap-1.5 text-muted">
            <span className="inline-block h-1.5 w-5 rounded-full bg-muted/60" aria-hidden />
            {t("private.sun.afternoonLegend", "thicker = after 15:00")}
          </li>
        </ul>
        <div>
          <label htmlFor={sliderId} className="flex items-center justify-between text-sm font-medium text-ink">
            <span>{t("private.sun.time", "Time of day")}</span>
            <span className="tabular text-brand-800">{label}</span>
          </label>
          <input
            id={sliderId}
            type="range"
            min={MIN_T}
            max={MAX_T}
            step={STEP}
            value={time}
            onChange={(e) => setTime(Number(e.target.value))}
            aria-valuetext={label}
            className="mt-2 w-full accent-[#19625b]"
          />
        </div>
        <table className="tabular w-full text-sm">
          <caption className="sr-only">{t("private.sun.tableCaption", "Sun position at the selected time")}</caption>
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="py-1.5 text-left font-medium">{t("private.sun.date", "Date")}</th>
              <th scope="col" className="py-1.5 text-right font-medium">{t("private.sun.direction", "Direction")}</th>
              <th scope="col" className="py-1.5 text-right font-medium">{t("private.sun.altitude", "Height")}</th>
            </tr>
          </thead>
          <tbody>
            {at.map((a) => (
              <tr key={a.key} className="border-b border-line/70 last:border-0">
                <th scope="row" className="py-1.5 text-left font-normal">
                  <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: COLORS[a.key] }} aria-hidden />
                  {t(`private.sun.day.${a.key}`, a.label)}
                </th>
                {a.point ? (
                  <>
                    <td className="py-1.5 text-right">
                      {compass(a.point.azimuth)} ({Math.round(a.point.azimuth)}°)
                    </td>
                    <td className="py-1.5 text-right">{Math.round(a.point.altitude)}°</td>
                  </>
                ) : (
                  <td colSpan={2} className="py-1.5 text-right text-muted">
                    {t("private.sun.belowHorizon", "Below the horizon")}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
