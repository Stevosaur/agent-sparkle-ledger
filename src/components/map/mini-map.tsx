"use client";

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

/** Small static-feel map for property pages. STUB — implemented by the map work package (Leaflet + OneMap tiles). */
export function MiniMap({ height = 240 }: MiniMapProps) {
  return <div className="rounded-xl bg-canvas" style={{ height }} aria-hidden />;
}
