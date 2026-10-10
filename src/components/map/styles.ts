/**
 * Basemap configuration and marker styles shared by MiniMap and the /map/ explorer.
 * Pure constants: safe to import from server or client code (no Leaflet import here).
 *
 * OneMap values follow docs/research/onemap-api.md §3: XYZ template (case-sensitive style name, no
 * `_HD`), minZoom 11 / maxZoom 19, the official max bounds, and the official attribution snippet with
 * the OneMap logo, which must stay visible whenever OneMap tiles show.
 */

export const ONEMAP_TILE_URL = "https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png";
export const ONEMAP_ATTRIBUTION =
  '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;display:inline-block;vertical-align:middle;" alt="OneMap logo"/>&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';
export const ONEMAP_MIN_ZOOM = 11;
export const ONEMAP_MAX_ZOOM = 19;
/** Official Leaflet sample bounds: SW (1.144, 103.535), NE (1.494, 104.502). */
export const ONEMAP_BOUNDS: [[number, number], [number, number]] = [
  [1.144, 103.535],
  [1.494, 104.502],
];

/** Fallback when OneMap tiles fail to load (OSM tile usage policy: attribution required, no bulk use). */
export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
export const OSM_MAX_ZOOM = 19;

/** Singapore-wide default view. */
export const SG_CENTER = { lat: 1.3521, lng: 103.8198 };
export const SG_ZOOM = 12;

/**
 * Switch to the fallback basemap when OneMap clearly is not serving tiles: either nothing has loaded
 * after a few errors, or errors keep outnumbering loads. A handful of failed edge tiles (OneMap returns
 * empty bodies outside Singapore) must not swap a working basemap.
 */
export function shouldFallbackToOsm(stats: { loads: number; errors: number }): boolean {
  if (stats.loads === 0 && stats.errors >= 3) return true;
  return stats.errors >= 12 && stats.errors > stats.loads * 2;
}

export type MarkerTone = "primary" | "mrt" | "future-mrt" | "school" | "launch" | "upcoming" | "hdb" | "condo";

export interface MarkerStyle {
  color: string;
  fillColor: string;
  fillOpacity: number;
  radius: number;
  weight: number;
  dashArray?: string;
}

/** CircleMarker styles per tone. Future MRT stations are hollow and dashed so they read differently from open ones. */
export const MARKER_STYLES: Record<MarkerTone, MarkerStyle> = {
  primary: { color: "#ffffff", fillColor: "#19625b", fillOpacity: 1, radius: 10, weight: 3 },
  launch: { color: "#ffffff", fillColor: "#e0780b", fillOpacity: 0.95, radius: 8, weight: 2 },
  upcoming: { color: "#ffffff", fillColor: "#7a5af8", fillOpacity: 0.95, radius: 8, weight: 2 },
  mrt: { color: "#ffffff", fillColor: "#3b6fd8", fillOpacity: 0.95, radius: 6, weight: 2 },
  "future-mrt": { color: "#3b6fd8", fillColor: "#ffffff", fillOpacity: 0.9, radius: 6, weight: 2.5, dashArray: "3 3" },
  school: { color: "#ffffff", fillColor: "#b5446e", fillOpacity: 0.9, radius: 5, weight: 1.5 },
  hdb: { color: "#ffffff", fillColor: "#0e9384", fillOpacity: 0.9, radius: 6, weight: 1.5 },
  condo: { color: "#ffffff", fillColor: "#6b8e23", fillOpacity: 0.9, radius: 6, weight: 1.5 },
};

/** Radius circle drawn around the subject on MiniMap. */
export const RADIUS_STYLE = { color: "#19625b", weight: 1.5, dashArray: "6 6", fillColor: "#19625b", fillOpacity: 0.05 } as const;
