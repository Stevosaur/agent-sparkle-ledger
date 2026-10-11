"use client";

import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { Circle, CircleMarker, MapContainer, Popup, Tooltip } from "react-leaflet";
import { useT } from "@/lib/i18n/provider";
import { BasemapLayer, InvalidateOnResize } from "./basemap-layer";
import { MARKER_STYLES, ONEMAP_BOUNDS, ONEMAP_MAX_ZOOM, ONEMAP_MIN_ZOOM, RADIUS_STYLE } from "./styles";
import type { MiniMapProps } from "./mini-map";

/** Leaflet implementation of MiniMap. Loaded with next/dynamic({ ssr: false }) from mini-map.tsx only. */
export default function MiniMapLeaflet({ center, zoom = 15, markers = [], radiusM }: MiniMapProps) {
  const t = useT();
  return (
    <MapContainer
      key={`${center.lat},${center.lng},${zoom}`}
      center={[center.lat, center.lng]}
      zoom={zoom}
      minZoom={ONEMAP_MIN_ZOOM}
      maxZoom={ONEMAP_MAX_ZOOM}
      maxBounds={ONEMAP_BOUNDS}
      scrollWheelZoom={false}
      dragging
      className="h-full w-full"
    >
      <BasemapLayer />
      <InvalidateOnResize />
      {radiusM && radiusM > 0 ? <Circle center={[center.lat, center.lng]} radius={radiusM} pathOptions={RADIUS_STYLE} interactive={false} /> : null}
      {markers.map((m, i) => {
        const style = MARKER_STYLES[m.tone ?? "primary"];
        return (
          <CircleMarker key={`${m.lat},${m.lng},${i}`} center={[m.lat, m.lng]} radius={style.radius} pathOptions={style} bubblingMouseEvents={false}>
            <Tooltip direction="top" offset={[0, -style.radius]}>
              {m.label}
            </Tooltip>
            {m.href ? (
              <Popup>
                <div className="text-sm">
                  <div className="font-medium text-ink">{m.label}</div>
                  <Link href={m.href} className="mt-1 inline-block text-brand-700 underline underline-offset-2">
                    {t("launches.map.viewPage", "View page")}
                  </Link>
                </div>
              </Popup>
            ) : null}
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
