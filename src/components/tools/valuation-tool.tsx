"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { Building, Building2, FileDown, Home } from "lucide-react";
import { SearchBox } from "@/components/search/search-box";
import { GatedPanel, PlusBadge } from "@/components/gating/gated-panel";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Notice } from "@/components/ui/notice";
import { Stat, StatGrid } from "@/components/ui/stat";
import { DataTable } from "@/components/ui/table";
import { useFeature } from "@/lib/auth/viewer-context";
import { useT } from "@/lib/i18n/provider";
import { formatDistance, formatMonth, formatPsf, formatSgd, SQFT_PER_SQM } from "@/lib/format";
import { formatPropertyRef } from "@/lib/property-ref";
import { refFromHref } from "@/lib/tools/refs";
import type { SearchEntry, SearchKind } from "@/lib/data/types";
import type { ValuationSubject } from "@/lib/tools/valuation-subject";
import type { ValuationComparable, ValuationKind, ValuationResponse } from "@/lib/valuation-service";
import { NumberField, parseNum, Segmented, SourceLine } from "./controls";

/** Stable kinds arrays (SearchBox re-fetches when the array identity changes). */
const KINDS: Record<ValuationKind, SearchKind[]> = {
  hdb: ["hdb"],
  condo: ["condo"],
  landed: ["landed", "landed-street"],
};

export interface ValuationRequestBody {
  ref: string;
  flatType?: string | null;
  storeyRange?: string | null;
  floor?: number | null;
  areaSqm: number;
}

/** Query string for the printable report page. */
export function reportQuery(body: ValuationRequestBody): string {
  const p = new URLSearchParams({ ref: body.ref, area: String(Math.round(body.areaSqm * 10) / 10) });
  if (body.flatType) p.set("flatType", body.flatType);
  if (body.storeyRange) p.set("storey", body.storeyRange);
  if (body.floor != null) p.set("floor", String(body.floor));
  return p.toString();
}

export function ValuationTool({
  subject,
  initialType,
  unresolved,
  privateAvailable,
}: {
  subject: ValuationSubject | null;
  initialType: ValuationKind;
  unresolved: string | null;
  /** false when no URA private transactions are loaded (condo / landed estimates impossible) */
  privateAvailable: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [typeOverride, setTypeOverride] = useState<ValuationKind | null>(null);
  const type = typeOverride ?? subject?.kind ?? initialType;
  const active = subject && subject.kind === type ? subject : null;

  function pick(entry: SearchEntry) {
    const ref = refFromHref(entry.href);
    if (!ref) return;
    setTypeOverride(null);
    router.push(`/valuation/?ref=${encodeURIComponent(formatPropertyRef(ref))}`, { scroll: false });
  }

  const typeOptions: { value: ValuationKind; label: ReactNode }[] = [
    {
      value: "hdb",
      label: (
        <span className="inline-flex items-center gap-1.5">
          <Building className="size-4" aria-hidden />
          {t("tools.val.typeHdb", "HDB")}
        </span>
      ),
    },
    {
      value: "condo",
      label: (
        <span className="inline-flex items-center gap-1.5">
          <Building2 className="size-4" aria-hidden />
          {t("tools.val.typeCondo", "Condo")}
        </span>
      ),
    },
    {
      value: "landed",
      label: (
        <span className="inline-flex items-center gap-1.5">
          <Home className="size-4" aria-hidden />
          {t("tools.val.typeLanded", "Landed")}
        </span>
      ),
    },
  ];

  const placeholders: Record<ValuationKind, string> = {
    hdb: t("tools.val.searchHdb", "Block and street, or postal code"),
    condo: t("tools.val.searchCondo", "Condo or EC project name"),
    landed: t("tools.val.searchLanded", "Landed address or street"),
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={t("tools.val.step1", "1. Choose the property")} />
        <CardBody className="space-y-4">
          <Segmented label={t("tools.val.typeLabel", "Property type")} value={type} options={typeOptions} onChange={(v) => setTypeOverride(v)} />
          {type !== "hdb" && !privateAvailable ? (
            <Notice tone="warn" title={t("tools.val.noPrivateTitle", "Private-property data is not loaded")}>
              {t(
                "tools.val.noPrivateBody",
                "Condo and landed estimates need URA private transaction records, which are not connected on this deployment (a URA Data Service key is required). HDB estimates still work.",
              )}
            </Notice>
          ) : (
            <div>
              <SearchBox key={type} kinds={KINDS[type]} placeholder={placeholders[type]} onSelect={pick} />
            </div>
          )}
          {unresolved ? (
            <Notice tone="warn">
              {t("tools.val.unresolved", "We could not find “{q}”. Search for it above.", { q: unresolved })}
            </Notice>
          ) : null}
          {active ? (
            <div className="rounded-lg bg-canvas px-4 py-3">
              <Link href={active.href} className="font-semibold text-brand-800 hover:underline">
                {active.label}
              </Link>
              {active.detail ? <div className="text-sm text-muted">{active.detail}</div> : null}
            </div>
          ) : null}
        </CardBody>
      </Card>

      {active ? (
        <ValuationForm key={active.ref} subject={active} />
      ) : (
        <EmptyState title={t("tools.val.emptyTitle", "Pick a property to value")}>
          {t("tools.val.emptyBody", "Search for an HDB block, a condo project or a landed address. The estimate uses recent sales of comparable homes nearby.")}
        </EmptyState>
      )}
    </div>
  );
}

function ValuationForm({ subject }: { subject: ValuationSubject }) {
  const t = useT();
  const hdb = subject.hdb;
  const defaultFlat = hdb ? ([...hdb.flatTypes].sort((a, b) => b.sales - a.sales)[0]?.flatType ?? "") : "";
  const [flatType, setFlatType] = useState(defaultFlat);
  const [storey, setStorey] = useState(hdb?.defaultStoreyRange ?? hdb?.storeyRanges[0] ?? "");
  const initialSqm = hdb
    ? (hdb.flatTypes.find((f) => f.flatType === defaultFlat)?.typicalAreaSqm ?? null)
    : subject.condo
      ? subject.condo.typicalAreaSqm
      : (subject.landed?.landAreaSqm ?? null);
  const [unit, setUnit] = useState<"sqm" | "sqft">(hdb ? "sqm" : "sqft");
  const [area, setArea] = useState(initialSqm == null ? "" : hdb ? String(initialSqm) : String(Math.round(initialSqm * SQFT_PER_SQM)));
  const [floor, setFloor] = useState(subject.condo?.typicalFloor != null ? String(subject.condo.typicalFloor) : "");

  const areaNum = parseNum(area);
  const areaSqm = areaNum != null && areaNum > 0 ? (unit === "sqft" ? areaNum / SQFT_PER_SQM : areaNum) : null;
  const floorNum = parseNum(floor);

  function changeUnit(next: "sqm" | "sqft") {
    if (next === unit) return;
    if (areaNum != null && areaNum > 0) setArea(String(next === "sqft" ? Math.round(areaNum * SQFT_PER_SQM) : Math.round((areaNum / SQFT_PER_SQM) * 10) / 10));
    setUnit(next);
  }

  function changeFlatType(ft: string) {
    setFlatType(ft);
    const typical = hdb?.flatTypes.find((f) => f.flatType === ft)?.typicalAreaSqm;
    if (typical != null) setArea(String(unit === "sqft" ? Math.round(typical * SQFT_PER_SQM) : typical));
  }

  const typicalNote = (() => {
    if (hdb) {
      const opt = hdb.flatTypes.find((f) => f.flatType === flatType);
      if (opt?.typicalAreaFrom === "block") return t("tools.val.areaFromBlock", "Prefilled with the typical size of this flat type in this block.");
      if (opt?.typicalAreaFrom === "town") return t("tools.val.areaFromTown", "No resales in this block yet: prefilled with the town's typical size for this flat type.");
      return t("tools.val.areaEnter", "Enter your floor area from your title deed or HDB records.");
    }
    if (subject.condo) return subject.condo.typicalAreaSqm != null ? t("tools.val.areaFromProject", "Prefilled with the median size of recent sales here. Enter your unit's strata area.") : t("tools.val.areaEnterUnit", "Enter your unit's strata area.");
    return subject.landed?.landAreaFrom === "address"
      ? t("tools.val.landFromAddress", "Prefilled with the land area recorded at this address's latest sale.")
      : subject.landed?.landAreaFrom === "street"
        ? t("tools.val.landFromStreet", "Prefilled with the median land area of sales on this street. Enter your own land area.")
        : t("tools.val.landEnter", "Enter your land area.");
  })();

  const body: ValuationRequestBody | null = useMemo(() => {
    if (areaSqm == null) return null;
    if (hdb) return flatType && storey ? { ref: subject.ref, flatType, storeyRange: storey, areaSqm: Math.round(areaSqm * 10) / 10 } : null;
    if (subject.condo) return { ref: subject.ref, floor: floorNum != null && floorNum >= 1 ? Math.round(floorNum) : null, areaSqm: Math.round(areaSqm * 10) / 10 };
    return { ref: subject.ref, areaSqm: Math.round(areaSqm * 10) / 10 };
  }, [areaSqm, hdb, flatType, storey, subject.ref, subject.condo, floorNum]);

  const areaLabel = subject.landed ? t("tools.val.landArea", "Land area") : t("tools.val.floorArea", "Floor area");

  return (
    <>
      <Card>
        <CardHeader title={t("tools.val.step2", "2. Tell us about the home")} />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            {hdb ? (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="val-flat-type" className="block text-sm font-medium text-ink">
                    {t("tools.val.flatType", "Flat type")}
                  </label>
                  <Select id="val-flat-type" value={flatType} onChange={(e) => changeFlatType(e.target.value)}>
                    {hdb.flatTypes.map((f) => (
                      <option key={f.flatType} value={f.flatType}>
                        {f.flatType}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="val-storey" className="block text-sm font-medium text-ink">
                    {t("tools.val.storey", "Storey range")}
                  </label>
                  <Select id="val-storey" value={storey} onChange={(e) => setStorey(e.target.value)}>
                    {hdb.storeyRanges.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            ) : null}
            <div className="space-y-2 sm:col-span-2">
              <div className="flex flex-wrap items-end gap-3">
                <NumberField
                  id="val-area"
                  className="w-full max-w-xs"
                  label={areaLabel}
                  value={area}
                  onChange={setArea}
                  suffix={unit}
                  min={1}
                  hint={typicalNote}
                />
                <Segmented
                  label={t("tools.val.unit", "Unit")}
                  hideLabel
                  value={unit}
                  onChange={changeUnit}
                  options={[
                    { value: "sqft", label: "sqft" },
                    { value: "sqm", label: "sqm" },
                  ]}
                  className="mb-6"
                />
              </div>
            </div>
            {subject.condo ? (
              <NumberField
                id="val-floor"
                label={t("tools.val.floor", "Floor")}
                value={floor}
                onChange={setFloor}
                min={1}
                max={subject.condo.maxFloor ?? undefined}
                step={1}
                hint={t("tools.val.floorHint", "Higher floors are adjusted upwards; leave blank to skip the floor adjustment.")}
              />
            ) : null}
          </div>
        </CardBody>
      </Card>

      <GatedPanel feature="valuation.estimate" minHeight={200}>
        <EstimatePanel body={body} />
      </GatedPanel>
    </>
  );
}

type FetchState = { key: string; status: "loading" } | { key: string; status: "done"; data: ValuationResponse } | { key: string; status: "error"; message: string };

function EstimatePanel({ body }: { body: ValuationRequestBody | null }) {
  const t = useT();
  const [state, setState] = useState<FetchState | null>(null);
  const key = body ? JSON.stringify(body) : "";
  const current = state && state.key === key ? state : null;
  const report = useFeature("valuation.report");

  async function run() {
    if (!body) return;
    setState({ key, status: "loading" });
    try {
      const res = await fetch("/api/gated/valuation/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: key,
      });
      const json = (await res.json().catch(() => null)) as (ValuationResponse & { message?: string }) | null;
      if (res.status === 401 || res.status === 402) {
        setState({ key, status: "error", message: t("tools.val.noAccess", "Your session has ended or your plan does not include this. Refresh the page to sign in again.") });
        return;
      }
      if (!res.ok || !json) {
        setState({ key, status: "error", message: json?.message ?? t("common.error", "Something went wrong. Please try again.") });
        return;
      }
      setState({ key, status: "done", data: json });
    } catch {
      setState({ key, status: "error", message: t("common.error", "Something went wrong. Please try again.") });
    }
  }

  return (
    <Card>
      <CardHeader
        title={t("tools.val.step3", "3. Estimate")}
        actions={
          <Button type="button" onClick={run} disabled={!body || current?.status === "loading"}>
            {current?.status === "loading" ? t("common.loading", "Loading…") : t("tools.val.run", "Estimate value")}
          </Button>
        }
      />
      <CardBody>
        {!body ? <p className="text-sm text-muted">{t("tools.val.needInputs", "Fill in the details above to get an estimate.")}</p> : null}
        {body && !current ? <p className="text-sm text-muted">{t("tools.val.ready", "Press “Estimate value” to run the comparable-sales model.")}</p> : null}
        {current?.status === "error" ? <Notice tone="warn">{current.message}</Notice> : null}
        {current?.status === "done" ? (
          <div className="space-y-6">
            <ValuationResult data={current.data} />
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <Link href={`/valuation/report/?${reportQuery(body!)}`} className={buttonClass("outline", "sm")}>
                <FileDown className="size-4" aria-hidden />
                {t("tools.val.download", "Download report")}
              </Link>
              {!report.allowed && !report.loading ? <PlusBadge /> : null}
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

const CONFIDENCE_TONE = { high: "up", medium: "info", low: "warn" } as const;

/** Estimate, comparables table and method notes. Shared with the printable report. */
export function ValuationResult({ data, compact }: { data: ValuationResponse; compact?: boolean }) {
  const t = useT();
  const confidenceLabel = {
    high: t("tools.val.confHigh", "High"),
    medium: t("tools.val.confMedium", "Medium"),
    low: t("tools.val.confLow", "Low"),
  }[data.confidence];
  const distanceText = (c: ValuationComparable) =>
    c.sameSite
      ? data.subject.kind === "hdb"
        ? t("tools.val.sameBlock", "Same block")
        : data.subject.kind === "condo"
          ? t("tools.val.sameProject", "Same project")
          : t("tools.val.sameStreet", "Same street")
      : c.distanceM == null
        ? t("tools.val.sameDistrict", "Same district")
        : formatDistance(c.distanceM);
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted">{t("tools.val.estimateLabel", "Estimated value")}</div>
        <div className="tabular mt-1 text-3xl font-bold text-ink">{formatSgd(data.estimate)}</div>
        <div className="mt-1 text-sm text-muted">
          {t("tools.val.rangeText", "Likely range {low} – {high}", { low: formatSgd(data.low), high: formatSgd(data.high) })}
        </div>
      </div>
      <StatGrid>
        <Stat label={t("tools.val.psf", "Price psf")} value={formatPsf(data.psf)} />
        <Stat label={t("tools.val.confidence", "Confidence")} value={<Badge tone={CONFIDENCE_TONE[data.confidence]}>{confidenceLabel}</Badge>} />
        <Stat label={t("tools.val.asOf", "As of")} value={formatMonth(data.asOf)} />
        <Stat
          label={t("tools.val.compsUsed", "Comparables used")}
          value={data.comparablesUsed}
          sub={t("tools.val.lookback", "Last {n} months", { n: data.lookbackMonths })}
        />
      </StatGrid>

      <section aria-labelledby="val-comps">
        <h3 id="val-comps" className="mb-2 text-base font-semibold text-ink">
          {t("tools.val.compsTitle", "Comparable sales")}
          {data.comparables.length < data.comparablesUsed ? (
            <span className="ml-2 text-sm font-normal text-muted">{t("tools.val.compsTop", "(closest {n} shown)", { n: data.comparables.length })}</span>
          ) : null}
        </h3>
        <DataTable
          dense={compact}
          rows={data.comparables}
          rowKey={(c, i) => `${c.month}-${c.label}-${i}`}
          columns={[
            { key: "month", header: t("tools.val.colMonth", "Month"), cell: (c) => formatMonth(c.month) },
            {
              key: "property",
              header: t("tools.val.colProperty", "Property"),
              cell: (c) => (
                <div className="min-w-40">
                  {c.href && !compact ? (
                    <Link href={c.href} className="font-medium text-brand-800 hover:underline">
                      {c.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-ink">{c.label}</span>
                  )}
                  <div className="text-xs text-muted">{c.detail}</div>
                </div>
              ),
            },
            { key: "dist", header: t("tools.val.colDistance", "Distance"), cell: distanceText },
            { key: "area", header: t("tools.val.colArea", "Area"), align: "right", cell: (c) => `${Math.round(c.areaSqm)} sqm` },
            { key: "price", header: t("tools.val.colPrice", "Price"), align: "right", cell: (c) => formatSgd(c.price) },
            { key: "psf", header: t("tools.val.colPsf", "psf"), align: "right", cell: (c) => formatSgd(c.psf) },
            { key: "adj", header: t("tools.val.colAdjPsf", "Adjusted psf"), align: "right", cell: (c) => formatSgd(c.adjustedPsf) },
          ]}
        />
      </section>

      <section aria-labelledby="val-method">
        <h3 id="val-method" className="mb-2 text-base font-semibold text-ink">
          {t("tools.val.methodTitle", "How this estimate was made")}
        </h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {data.method.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <SourceLine>
          {t("common.source", "Source")}: {data.source}
          {data.index ? ` · ${t("tools.val.index", "Index")}: ${data.index.label}` : ""}
        </SourceLine>
      </section>
    </div>
  );
}
