import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { Stat } from "@/components/ui/stat";
import { MiniMap, type MapMarker } from "@/components/map/mini-map";
import { T } from "@/components/i18n/t";
import { formatDistance } from "@/lib/format";
import { titleCase } from "@/lib/slug";
import { SourceLine } from "./source-line";
import type { LatLng, NearbyStation } from "@/lib/data/types";

export type StationWithCoords = NearbyStation & LatLng & { approximate: boolean };

function StationName({ s }: { s: NearbyStation }) {
  return (
    <span className="font-medium text-ink">
      {titleCase(s.name)} <span className="font-normal text-muted">{s.codes.join(" · ")}</span>
    </span>
  );
}

/** Section 3 body: mini map, nearest MRT/LRT stations, announced future stations and distance to the CBD. */
export function BlockLocation({
  label,
  coords,
  stations,
  futureStations,
  cbdDistanceM,
  nearestMrt,
}: {
  label: string;
  coords: LatLng | null;
  /** operational stations within 2 km, nearest first */
  stations: StationWithCoords[];
  /** announced future stations within 2 km, nearest first */
  futureStations: StationWithCoords[];
  cbdDistanceM: number | null;
  /** precomputed nearest station (used only when the block has no coordinates) */
  nearestMrt: NearbyStation | null;
}) {
  if (!coords) {
    return (
      <div className="space-y-3">
        <Notice tone="warn">
          <T k="hdb.location.noCoords" fallback="This block has not been geocoded yet (OneMap), so the map and distances to MRT stations are not available." />
        </Notice>
        {nearestMrt ? (
          <p className="text-sm text-ink">
            <T k="hdb.location.nearestMrt" fallback="Nearest MRT/LRT station" />: <StationName s={nearestMrt} /> · {formatDistance(nearestMrt.distanceM)}
          </p>
        ) : null}
      </div>
    );
  }

  const markers: MapMarker[] = [
    { lat: coords.lat, lng: coords.lng, label, tone: "primary" },
    ...stations.slice(0, 3).map((s) => ({ lat: s.lat, lng: s.lng, label: `${titleCase(s.name)} (${s.codes.join(" / ")})`, tone: "mrt" as const })),
    ...futureStations.map((s) => ({ lat: s.lat, lng: s.lng, label: `${titleCase(s.name)} (${s.codes.join(" / ")})`, tone: "future-mrt" as const })),
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <MiniMap center={coords} zoom={15} markers={markers} height={280} radiusM={1000} />
        </div>
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title={<T k="hdb.location.stations" fallback="MRT/LRT within 2 km" />} />
            <CardBody className="py-2">
              {stations.length === 0 ? (
                <p className="py-2 text-sm text-muted">
                  <T k="hdb.location.noStations" fallback="No operational MRT or LRT station within 2 km (straight line)." />
                </p>
              ) : (
                <ul className="divide-y divide-line/70">
                  {stations.map((s) => (
                    <li key={`${s.name}-${s.codes.join()}`} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                      <StationName s={s} />
                      <span className="tabular shrink-0 text-muted">{formatDistance(s.distanceM)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          {cbdDistanceM != null ? (
            <Card>
              <CardBody>
                <Stat
                  label={<T k="hdb.location.cbd" fallback="Distance to CBD" />}
                  value={formatDistance(cbdDistanceM)}
                  sub={<T k="hdb.location.cbdSub" fallback="Straight line to Raffles Place" />}
                />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader
          title={<T k="hdb.location.upcoming" fallback="Upcoming MRT stations" />}
          description={<T k="hdb.location.upcomingDesc" fallback="Stations announced by LTA within 2 km of this block." />}
        />
        <CardBody className="py-2">
          {futureStations.length === 0 ? (
            <p className="py-2 text-sm text-muted">
              <T k="hdb.location.noUpcoming" fallback="No announced future MRT stations within 2 km." />
            </p>
          ) : (
            <ul className="divide-y divide-line/70">
              {futureStations.map((s) => (
                <li key={`${s.name}-${s.codes.join()}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <StationName s={s} />
                    {s.expectedYear != null ? (
                      <Badge tone="info">
                        <T k="hdb.location.expected" fallback="Expected {year}" vars={{ year: s.expectedYear }} />
                      </Badge>
                    ) : null}
                    {s.approximate ? (
                      <span className="text-xs text-muted">
                        <T k="hdb.location.approx" fallback="approximate location" />
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular shrink-0 text-muted">{formatDistance(s.distanceM)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <SourceLine>
        <T k="hdb.source.location" fallback="LTA (MRT/LRT stations and future lines), OneMap (block coordinates). Distances are straight-line." />
      </SourceLine>
    </div>
  );
}
