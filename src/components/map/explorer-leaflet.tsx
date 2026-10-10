"use client";

import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleMarker, LayerGroup, MapContainer, Popup, Tooltip, useMap } from "react-leaflet";
import { useT } from "@/lib/i18n/provider";
import { titleCase } from "@/lib/slug";
import { formatInt } from "@/lib/format";
import { districtLabel, launchHref } from "@/lib/launch-insights";
import { BasemapLayer, InvalidateOnResize } from "./basemap-layer";
import { focusHref, parseFocus, type MapLaunch, type MapSchool, type MapStation } from "./layers";
import { MARKER_STYLES, ONEMAP_BOUNDS, ONEMAP_MAX_ZOOM, ONEMAP_MIN_ZOOM, SG_CENTER, SG_ZOOM } from "./styles";

export interface ExplorerLayers {
  launches: MapLaunch[];
  mrt: MapStation[];
  futureMrt: MapStation[];
  schools: MapSchool[];
}

export interface ExplorerVisibility {
  launches: boolean;
  mrt: boolean;
  futureMrt: boolean;
  schools: boolean;
}

type Selection =
  | { kind: "launch"; item: MapLaunch }
  | { kind: "mrt"; item: MapStation; future: boolean }
  | { kind: "school"; item: MapSchool };

/** Pans to `?focus=lat,lng,zoom` whenever it changes after the first render (client-side navigation). */
function FocusController({ focus }: { focus: { lat: number; lng: number; zoom: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.setView([focus.lat, focus.lng], focus.zoom);
  }, [map, focus]);
  return null;
}

function SelectionPopup({ selection, onClose }: { selection: Selection; onClose: (closing: Selection) => void }) {
  const t = useT();
  const { item } = selection;
  const handlers = useMemo(() => ({ remove: () => onClose(selection) }), [onClose, selection]);
  return (
    <Popup position={[item.lat, item.lng]} eventHandlers={handlers} autoPan>
      <div className="min-w-44 text-sm leading-5">
        {selection.kind === "launch" ? (
          <>
            <div className="font-semibold text-ink">{titleCase(selection.item.name)}</div>
            <div className="mt-0.5 text-xs text-muted">
              {selection.item.status === "launched" ? t("launches.status.launched", "Launched") : t("launches.status.upcoming", "Upcoming")}
              {selection.item.district != null ? ` · ${districtLabel(selection.item.district)}` : ""}
              {selection.item.segment ? ` · ${selection.item.segment}` : ""}
            </div>
            {selection.item.totalUnits != null ? (
              <div className="mt-1 text-xs text-ink">{t("launches.map.units", "{n} units", { n: formatInt(selection.item.totalUnits) })}</div>
            ) : null}
            {selection.item.expectedCompletionYear != null ? (
              <div className="text-xs text-ink">{t("launches.map.completion", "Expected completion {year}", { year: selection.item.expectedCompletionYear })}</div>
            ) : null}
            <Link href={launchHref(selection.item)} className="mt-2 inline-block font-medium text-brand-700 underline underline-offset-2">
              {t("launches.map.viewLaunch", "View launch")}
            </Link>
          </>
        ) : selection.kind === "mrt" ? (
          <>
            <div className="font-semibold text-ink">{titleCase(selection.item.name)}</div>
            {selection.item.codes.length ? <div className="mt-0.5 text-xs text-muted">{selection.item.codes.join(" · ")}</div> : null}
            <div className="mt-1 text-xs text-ink">
              {selection.future
                ? selection.item.expectedYear != null
                  ? t("launches.map.opens", "Expected to open {year}", { year: selection.item.expectedYear })
                  : t("launches.map.opensUnknown", "Future station, opening year not announced")
                : t("launches.map.operational", "Operational station")}
            </div>
            {selection.item.approximate ? <div className="text-xs text-muted">{t("launches.map.approximate", "Approximate location")}</div> : null}
            <Link href={focusHref(item.lat, item.lng, 16)} className="mt-2 inline-block font-medium text-brand-700 underline underline-offset-2">
              {t("launches.map.linkHere", "Link to this spot")}
            </Link>
          </>
        ) : (
          <>
            <div className="font-semibold text-ink">{titleCase(selection.item.name)}</div>
            <div className="mt-0.5 text-xs text-muted">
              {titleCase(selection.item.address)}
              {selection.item.postal ? ` · S${selection.item.postal}` : ""}
            </div>
            <Link href={focusHref(item.lat, item.lng, 16)} className="mt-2 inline-block font-medium text-brand-700 underline underline-offset-2">
              {t("launches.map.linkHere", "Link to this spot")}
            </Link>
          </>
        )}
      </div>
    </Popup>
  );
}

/** Full-page Leaflet map for /map/. Loaded with next/dynamic({ ssr: false }) from map-explorer.tsx only. */
export default function ExplorerLeaflet({ layers, visible }: { layers: ExplorerLayers; visible: ExplorerVisibility }) {
  const t = useT();
  const params = useSearchParams();
  const focusRaw = params?.get("focus") ?? null;
  const focus = useMemo(() => parseFocus(focusRaw), [focusRaw]);
  const [initial] = useState(() => focus ?? { ...SG_CENTER, zoom: SG_ZOOM });
  const [selection, setSelection] = useState<Selection | null>(null);
  // a popup being replaced fires "remove" after the next one is selected: only clear our own selection
  const close = useCallback((closing: Selection) => setSelection((cur) => (cur === closing ? null : cur)), []);

  return (
    <MapContainer
      center={[initial.lat, initial.lng]}
      zoom={initial.zoom}
      minZoom={ONEMAP_MIN_ZOOM}
      maxZoom={ONEMAP_MAX_ZOOM}
      maxBounds={ONEMAP_BOUNDS}
      className="h-full w-full"
    >
      <BasemapLayer />
      <InvalidateOnResize />
      <FocusController focus={focus} />

      {visible.schools ? (
        <LayerGroup>
          {layers.schools.map((s) => (
            <CircleMarker
              key={`s-${s.name}-${s.postal}`}
              center={[s.lat, s.lng]}
              radius={MARKER_STYLES.school.radius}
              pathOptions={MARKER_STYLES.school}
              bubblingMouseEvents={false}
              eventHandlers={{ click: () => setSelection({ kind: "school", item: s }) }}
            />
          ))}
        </LayerGroup>
      ) : null}

      {visible.mrt ? (
        <LayerGroup>
          {layers.mrt.map((s) => (
            <CircleMarker
              key={`m-${s.name}-${s.codes.join("")}`}
              center={[s.lat, s.lng]}
              radius={MARKER_STYLES.mrt.radius}
              pathOptions={MARKER_STYLES.mrt}
              bubblingMouseEvents={false}
              eventHandlers={{ click: () => setSelection({ kind: "mrt", item: s, future: false }) }}
            />
          ))}
        </LayerGroup>
      ) : null}

      {visible.futureMrt ? (
        <LayerGroup>
          {layers.futureMrt.map((s) => (
            <CircleMarker
              key={`f-${s.name}-${s.codes.join("")}`}
              center={[s.lat, s.lng]}
              radius={MARKER_STYLES["future-mrt"].radius}
              pathOptions={MARKER_STYLES["future-mrt"]}
              bubblingMouseEvents={false}
              eventHandlers={{ click: () => setSelection({ kind: "mrt", item: s, future: true }) }}
            />
          ))}
        </LayerGroup>
      ) : null}

      {visible.launches ? (
        <LayerGroup>
          {layers.launches.map((l) => {
            const style = l.status === "launched" ? MARKER_STYLES.launch : MARKER_STYLES.upcoming;
            return (
              <CircleMarker
                key={`l-${l.type}-${l.slug}`}
                center={[l.lat, l.lng]}
                radius={style.radius}
                pathOptions={style}
                bubblingMouseEvents={false}
              eventHandlers={{ click: () => setSelection({ kind: "launch", item: l }) }}
              />
            );
          })}
        </LayerGroup>
      ) : null}

      {focus ? (
        <CircleMarker center={[focus.lat, focus.lng]} radius={MARKER_STYLES.primary.radius} pathOptions={MARKER_STYLES.primary} bubblingMouseEvents={false}>
          <Tooltip direction="top" offset={[0, -MARKER_STYLES.primary.radius]}>
            {t("launches.map.sharedSpot", "Shared location")}
          </Tooltip>
        </CircleMarker>
      ) : null}

      {selection ? <SelectionPopup key={`${selection.kind}-${selection.item.lat}-${selection.item.lng}-${selection.item.name}`} selection={selection} onClose={close} /> : null}
    </MapContainer>
  );
}
