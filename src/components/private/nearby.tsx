import type { ReactNode } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { T } from "@/components/i18n/t";
import { MiniMap, type MapMarker } from "@/components/map/mini-map";
import { formatDistance } from "@/lib/format";
import { titleCase } from "@/lib/slug";
import type { NearbyContext, SchoolNear, StationNear } from "./server-data";
import { SourceLine } from "./source-line";

function StationItem({ s }: { s: StationNear }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-1.5">
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-ink">{titleCase(s.name)}</span>
        {s.codes.map((c) => (
          <Badge key={c} tone="brand">
            {c}
          </Badge>
        ))}
        {s.status === "future" ? (
          <Badge tone="info">
            {s.expectedYear != null ? (
              <T k="private.nearby.opens" fallback="Expected {year}" vars={{ year: s.expectedYear }} />
            ) : (
              <T k="private.nearby.announced" fallback="Announced" />
            )}
          </Badge>
        ) : null}
        {s.approximate ? (
          <span className="text-xs text-muted">
            <T k="private.nearby.approx" fallback="(approximate location)" />
          </span>
        ) : null}
      </span>
      <span className="tabular text-sm text-muted">{formatDistance(s.distanceM)}</span>
    </li>
  );
}

function SchoolList({ items, empty }: { items: SchoolNear[]; empty: ReactNode }) {
  if (items.length === 0) return <p className="py-1.5 text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line/70">
      {items.map((s) => (
        <li key={s.name} className="flex items-center justify-between gap-2 py-1.5 text-sm">
          <span className="text-ink">{titleCase(s.name)}</span>
          <span className="tabular shrink-0 text-muted">{formatDistance(s.distanceM)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Primary schools (1 km / 1–2 km), nearest MRT, future MRT within 2 km and a mini map. */
export function NearbyAmenities({ ctx, label }: { ctx: NearbyContext; label: string }) {
  const markers: MapMarker[] = [
    { ...ctx.center, label, tone: "primary" },
    ...ctx.mrt.map((s) => ({ lat: s.lat, lng: s.lng, label: `${titleCase(s.name)} (${s.codes.join(" / ")})`, tone: "mrt" as const })),
    ...ctx.futureMrt.map((s) => ({ lat: s.lat, lng: s.lng, label: `${titleCase(s.name)} (${s.expectedYear ?? "future"})`, tone: "future-mrt" as const })),
    ...[...ctx.schools1k, ...ctx.schools2k].map((s) => ({ lat: s.lat, lng: s.lng, label: titleCase(s.name), tone: "school" as const })),
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title={<T k="private.nearby.schools" fallback="Primary schools" />} />
          <CardBody className="space-y-3">
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted">
                <T k="private.nearby.within1k" fallback="Within 1 km" />
              </h4>
              <SchoolList items={ctx.schools1k} empty={<T k="private.nearby.noSchools1k" fallback="No primary school within 1 km." />} />
            </div>
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted">
                <T k="private.nearby.within2k" fallback="1–2 km" />
              </h4>
              <SchoolList items={ctx.schools2k} empty={<T k="private.nearby.noSchools2k" fallback="No primary school between 1 and 2 km." />} />
            </div>
            <p className="text-xs text-muted">
              <T
                k="private.nearby.schoolNote"
                fallback="Straight-line distances from the development's map point. MOE's Primary 1 registration priority is measured from each home address, so check the exact address on OneMap."
              />
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={<T k="private.nearby.mrt" fallback="MRT / LRT" />} />
          <CardBody className="space-y-3">
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted">
                <T k="private.nearby.nearest" fallback="Nearest stations" />
              </h4>
              {ctx.mrt.length ? (
                <ul className="divide-y divide-line/70">
                  {ctx.mrt.map((s) => (
                    <StationItem key={s.name} s={s} />
                  ))}
                </ul>
              ) : (
                <p className="py-1.5 text-sm text-muted">
                  <T k="private.nearby.noMrt" fallback="Station data is not loaded." />
                </p>
              )}
            </div>
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted">
                <T k="private.nearby.future" fallback="Future stations within 2 km" />
              </h4>
              {ctx.futureMrt.length ? (
                <ul className="divide-y divide-line/70">
                  {ctx.futureMrt.map((s) => (
                    <StationItem key={s.name} s={s} />
                  ))}
                </ul>
              ) : (
                <p className="py-1.5 text-sm text-muted">
                  <T k="private.nearby.noFuture" fallback="No announced station within 2 km." />
                </p>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
      <MiniMap center={ctx.center} zoom={14} markers={markers} radiusM={1000} height={280} />
      <SourceLine>
        <T k="private.nearby.source" fallback="MOE school directory (data.gov.sg), LTA station locations; distances are straight-line." />
      </SourceLine>
    </div>
  );
}

/** Straight-line commute facts: distance to the CBD and to the nearest stations. Never travel times. */
export function CommuteFacts({ ctx }: { ctx: NearbyContext }) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">
              <T k="private.commute.cbd" fallback="To the CBD (Raffles Place)" />
            </dt>
            <dd className="tabular mt-1 text-xl font-semibold text-ink">{formatDistance(ctx.cbdM)}</dd>
          </div>
          {ctx.mrt[0] ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                <T k="private.commute.nearestMrt" fallback="To the nearest station" />
              </dt>
              <dd className="mt-1">
                <span className="tabular text-xl font-semibold text-ink">{formatDistance(ctx.mrt[0].distanceM)}</span>{" "}
                <span className="text-sm text-muted">
                  {titleCase(ctx.mrt[0].name)} ({ctx.mrt[0].codes.join(" / ")})
                </span>
              </dd>
            </div>
          ) : null}
        </dl>
        {ctx.mrt.length > 1 ? (
          <ul className="flex flex-wrap gap-2 text-sm">
            {ctx.mrt.slice(1).map((s) => (
              <li key={s.name} className="rounded-lg bg-canvas px-2.5 py-1">
                {titleCase(s.name)} <span className="text-muted">· {formatDistance(s.distanceM)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-muted">
          <T
            k="private.commute.note"
            fallback="Straight-line distances only. Journey times are not shown because no journey-planner source is connected; real routes are longer."
          />
        </p>
      </CardBody>
    </Card>
  );
}
