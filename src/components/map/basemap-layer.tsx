"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TileLayer, useMap } from "react-leaflet";
import {
  ONEMAP_ATTRIBUTION,
  ONEMAP_MAX_ZOOM,
  ONEMAP_MIN_ZOOM,
  ONEMAP_TILE_URL,
  OSM_ATTRIBUTION,
  OSM_MAX_ZOOM,
  OSM_TILE_URL,
  shouldFallbackToOsm,
} from "./styles";

/**
 * OneMap basemap with an automatic OpenStreetMap fallback when OneMap tiles fail to load.
 * Only rendered inside a react-leaflet MapContainer (client-only module).
 */
export function BasemapLayer() {
  const [provider, setProvider] = useState<"onemap" | "osm">("onemap");
  const stats = useRef({ loads: 0, errors: 0 });
  const handlers = useMemo(
    () => ({
      tileload: () => {
        stats.current.loads++;
      },
      tileerror: () => {
        stats.current.errors++;
        if (shouldFallbackToOsm(stats.current)) setProvider("osm");
      },
    }),
    [],
  );

  if (provider === "osm") {
    return <TileLayer key="osm" url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} maxZoom={OSM_MAX_ZOOM} minZoom={ONEMAP_MIN_ZOOM} />;
  }
  return <TileLayer key="onemap" url={ONEMAP_TILE_URL} attribution={ONEMAP_ATTRIBUTION} minZoom={ONEMAP_MIN_ZOOM} maxZoom={ONEMAP_MAX_ZOOM} eventHandlers={handlers} />;
}

/** Keeps Leaflet's size in sync with its container (flex layouts, late-loading banners, rotation). */
export function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}
