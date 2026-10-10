"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { decodeLaunch, decodeSchool, decodeStation, type MapLayersPayload } from "./layers";
import { MARKER_STYLES, type MarkerStyle } from "./styles";
import type { ExplorerLayers, ExplorerVisibility } from "./explorer-leaflet";

const ExplorerLeaflet = dynamic(() => import("./explorer-leaflet"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-canvas" aria-hidden />,
});

type LayerKey = keyof ExplorerVisibility;

const DEFAULT_VISIBLE: ExplorerVisibility = { launches: true, mrt: true, futureMrt: true, schools: false };

function Swatch({ style }: { style: MarkerStyle }) {
  return (
    <span
      aria-hidden
      className="inline-block size-3 shrink-0 rounded-full"
      style={{ background: style.fillColor, border: `2px ${style.dashArray ? "dashed" : "solid"} ${style.dashArray ? style.color : style.fillColor}` }}
    />
  );
}

/**
 * /map/ explorer: layer toggles above a map that fills the viewport below the sticky site header
 * (and above the mobile tab bar). Layers come from GET /api/map/layers/.
 */
export function MapExplorer({ heading }: { heading: ReactNode }) {
  const t = useT();
  const [chrome, setChrome] = useState<{ top: number; bottom: number } | null>(null);
  const [visible, setVisible] = useState<ExplorerVisibility>(DEFAULT_VISIBLE);
  const [payload, setPayload] = useState<MapLayersPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Height = viewport minus the sticky header and the mobile tab bar, measured so banners and the
  // two-row mobile header are accounted for.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("header.sticky");
    const tabs = document.querySelector<HTMLElement>('nav[aria-label="Tabs"]');
    const measure = () => {
      const top = header ? header.getBoundingClientRect().height : 0;
      const bottom = tabs && tabs.offsetParent !== null ? tabs.getBoundingClientRect().height : 0;
      setChrome((prev) => (prev && prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
    };
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      const id = window.requestAnimationFrame(measure);
      return () => {
        window.removeEventListener("resize", measure);
        window.cancelAnimationFrame(id);
      };
    }
    const ro = new ResizeObserver(measure);
    if (header) ro.observe(header);
    if (tabs) ro.observe(tabs);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/map/layers/")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as MapLayersPayload;
      })
      .then((body) => {
        if (!cancelled) setPayload(body);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "network_error");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  const layers = useMemo<ExplorerLayers | null>(
    () =>
      payload
        ? {
            launches: payload.launches.map(decodeLaunch),
            mrt: payload.mrt.map(decodeStation),
            futureMrt: payload.futureMrt.map(decodeStation),
            schools: payload.schools.map(decodeSchool),
          }
        : null,
    [payload],
  );

  const launched = layers?.launches.filter((l) => l.status === "launched").length ?? 0;
  const upcoming = (layers?.launches.length ?? 0) - launched;

  const toggles: { key: LayerKey; label: string; count: number | null; swatches: MarkerStyle[] }[] = [
    { key: "launches", label: t("launches.map.layer.launches", "New launches"), count: layers ? layers.launches.length : null, swatches: [MARKER_STYLES.launch, MARKER_STYLES.upcoming] },
    { key: "mrt", label: t("launches.map.layer.mrt", "MRT/LRT stations"), count: layers ? layers.mrt.length : null, swatches: [MARKER_STYLES.mrt] },
    { key: "futureMrt", label: t("launches.map.layer.futureMrt", "Future MRT"), count: layers ? layers.futureMrt.length : null, swatches: [MARKER_STYLES["future-mrt"]] },
    { key: "schools", label: t("launches.map.layer.schools", "Primary schools"), count: layers ? layers.schools.length : null, swatches: [MARKER_STYLES.school] },
  ];

  const style = chrome ? { height: `max(360px, calc(100dvh - ${Math.round(chrome.top + chrome.bottom)}px))` } : undefined;

  return (
    <div
      className={cn("flex flex-col", !chrome && "h-[max(360px,calc(100dvh-10.5rem))] md:h-[max(360px,calc(100dvh-6.6rem))]")}
      style={style}
    >
      <div className="shrink-0 border-b border-line bg-surface px-4 py-2 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {heading}
          <fieldset className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5">
            <legend className="sr-only">{t("launches.map.layers", "Map layers")}</legend>
            {toggles.map((tg) => (
              <label
                key={tg.key}
                className={cn(
                  "flex shrink-0 cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500",
                  visible[tg.key] ? "border-brand-200 bg-brand-50 text-brand-900" : "border-line bg-surface text-muted",
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={visible[tg.key]}
                  onChange={(e) => setVisible((v) => ({ ...v, [tg.key]: e.target.checked }))}
                />
                <span className="flex items-center -space-x-1">
                  {tg.swatches.map((s, i) => (
                    <Swatch key={i} style={s} />
                  ))}
                </span>
                <span className="whitespace-nowrap">{tg.label}</span>
                {tg.count != null ? <span className="tabular text-xs text-muted">{tg.count}</span> : null}
              </label>
            ))}
          </fieldset>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <Swatch style={MARKER_STYLES.launch} />
            {t("launches.map.legend.launched", "Launched")} {layers ? `(${launched})` : ""}
          </span>
          <span className="flex items-center gap-1.5">
            <Swatch style={MARKER_STYLES.upcoming} />
            {t("launches.map.legend.upcoming", "Upcoming")} {layers ? `(${upcoming})` : ""}
          </span>
          <span className="flex items-center gap-1.5">
            <Swatch style={MARKER_STYLES["future-mrt"]} />
            {t("launches.map.legend.future", "Future station (expected year in popup)")}
          </span>
          <span>{t("launches.map.source", "Sources: URA (launches), LTA (MRT), MOE (schools). Basemap: OneMap, Singapore Land Authority.")}</span>
        </div>
      </div>

      <div className="relative isolate min-h-0 flex-1 bg-canvas">
        {layers ? <ExplorerLeaflet layers={layers} visible={visible} /> : null}
        {!layers && !error ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted" role="status">
            {t("launches.map.loading", "Loading map layers…")}
          </div>
        ) : null}
        {error ? (
          <div className="absolute inset-0 z-[500] flex items-center justify-center p-4" role="alert">
            <div className="max-w-sm rounded-xl border border-line bg-surface p-4 text-center text-sm shadow">
              <p className="text-ink">{t("launches.map.error", "The map layers could not be loaded.")}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
                {t("launches.map.retry", "Try again")}
              </Button>
            </div>
          </div>
        ) : null}
        {payload ? <MissingNotes payload={payload} /> : null}
      </div>
    </div>
  );
}

function MissingNotes({ payload }: { payload: MapLayersPayload }) {
  const t = useT();
  const notes: string[] = [];
  if (payload.launches.length === 0 && payload.missingCoords.launches === 0) {
    notes.push(t("launches.map.noLaunches", "No new launches to show: launch data comes from URA developer sales, which needs the URA data key."));
  }
  if (payload.missingCoords.launches > 0) {
    notes.push(t("launches.map.missingLaunches", "{n} launches are not on the map because they have no coordinates yet.", { n: payload.missingCoords.launches }));
  }
  if (payload.mrt.length === 0 && payload.futureMrt.length === 0) {
    notes.push(t("launches.map.noMrt", "No MRT stations loaded: station data comes from LTA / OneMap."));
  }
  if (payload.schools.length === 0) {
    notes.push(t("launches.map.noSchools", "No primary schools loaded: school data comes from MOE via data.gov.sg."));
  }
  if (!notes.length) return null;
  return (
    <div className="pointer-events-none absolute left-14 right-2 top-2 z-[500] sm:left-auto sm:max-w-sm">
      <ul className="pointer-events-auto space-y-1 rounded-lg border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs text-amber-900 shadow-sm">
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
