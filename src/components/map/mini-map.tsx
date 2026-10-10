"use client";

import dynamic from "next/dynamic";
import { useT } from "@/lib/i18n/provider";
import { MARKER_STYLES } from "./styles";

export interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  tone?: "primary" | "mrt" | "future-mrt" | "school" | "launch" | "hdb" | "condo";
  href?: string;
}

export interface MiniMapProps {
  center: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  height?: number;
  /** optional radius circle around the center, metres */
  radiusM?: number;
}

const MiniMapLeaflet = dynamic(() => import("./mini-map-leaflet"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-canvas" aria-hidden />,
});

const TONE_KEYS: Record<NonNullable<MapMarker["tone"]>, [string, string]> = {
  primary: ["launches.map.tone.primary", "This property"],
  mrt: ["launches.map.tone.mrt", "MRT/LRT station"],
  "future-mrt": ["launches.map.tone.futureMrt", "Future MRT station"],
  school: ["launches.map.tone.school", "School"],
  launch: ["launches.map.tone.launch", "New launch"],
  hdb: ["launches.map.tone.hdb", "HDB block"],
  condo: ["launches.map.tone.condo", "Condo"],
};

/**
 * Small map for property pages: OneMap basemap (OpenStreetMap fallback), tone-coloured markers, an
 * optional radius circle, scroll-wheel zoom off so the page scrolls normally. Leaflet loads client-side
 * only; the marker list is repeated as text for screen readers.
 */
export function MiniMap({ center, zoom = 15, markers = [], height = 240, radiusM }: MiniMapProps) {
  const t = useT();
  const tones = [...new Set(markers.map((m) => m.tone ?? "primary"))];
  return (
    <div>
      <div role="region" aria-label={t("launches.map.miniLabel", "Map")} className="relative isolate overflow-hidden rounded-xl border border-line bg-canvas" style={{ height }}>
        <MiniMapLeaflet center={center} zoom={zoom} markers={markers} radiusM={radiusM} />
      </div>
      {tones.length > 1 ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden>
          {tones.map((tone) => {
            const s = MARKER_STYLES[tone];
            return (
              <li key={tone} className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-full" style={{ background: s.fillColor, border: `1.5px ${s.dashArray ? "dashed" : "solid"} ${s.dashArray ? s.color : s.fillColor}` }} />
                {t(TONE_KEYS[tone][0], TONE_KEYS[tone][1])}
              </li>
            );
          })}
        </ul>
      ) : null}
      {markers.length ? (
        <ul className="sr-only">
          {markers.map((m, i) => (
            <li key={`${m.lat},${m.lng},${i}`}>
              {t(TONE_KEYS[m.tone ?? "primary"][0], TONE_KEYS[m.tone ?? "primary"][1])}: {m.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
