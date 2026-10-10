import Link from "next/link";
import type { ReactNode } from "react";
import { configuredContactEmail, site } from "@/lib/config/site";
import { pageMetadata } from "@/lib/seo";
import { getMeta } from "@/lib/data/meta";
import type { SourceInfo, SourceStatus } from "@/lib/data/types";
import { formatInt, formatMonth, SQFT_PER_SQM } from "@/lib/format";
import { hdbBlockSlug, landedAddressSlug, landedStreetSlug, projectSlug } from "@/lib/slug";
import { BALA_TABLE } from "@/lib/calc/lease";
import { RULE_META } from "@/lib/calc/rules";
import { CPF_LEASE_COVER_AGE, CPF_MIN_REMAINING_LEASE, HDB_LEASE_YEARS, HDB_MOP_YEARS, HDB_MOP_YEARS_PLUS_PRIME } from "@/lib/calc/rules";
import { LIST_DEFS, type ListId } from "@/lib/rankings";
import {
  EXTENDED_LOOKBACK_MONTHS,
  FLOOR_PREMIUM_PER_LEVEL,
  HDB_LOOKBACK_MONTHS,
  MAX_COMPARABLES_USED,
  MIN_COMPARABLES,
  MIN_SAME_SITE,
  NEARBY_RADIUS_M,
  PRIVATE_LOOKBACK_MONTHS,
} from "@/lib/valuation-service";
import { rulesReferenceItems } from "@/lib/ai/prompt";
import { T } from "@/components/i18n/t";
import { PageLang } from "@/components/i18n/page-lang";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageContainer, PageHeader } from "@/components/ui/section";
import { Stat, StatGrid } from "@/components/ui/stat";
import { DataTable, type Column } from "@/components/ui/table";
import { LegalBody, LegalSection } from "../privacy/_components/legal";

export const revalidate = 86400;

export const metadata = pageMetadata({
  title: "Methodology",
  description: `Where ${site.name}'s data comes from, how sales are matched to pages, and how valuations, yields, demand vs supply, en-bloc tiers and lease figures are computed, with their limitations.`,
  path: "/methodology/",
});

const STATUS: Record<SourceStatus, { tone: "up" | "warn" | "down" | "neutral"; k: string; label: string }> = {
  ok: { tone: "up", k: "trust.method.status.ok", label: "Loaded" },
  "missing-credentials": { tone: "warn", k: "trust.method.status.missing", label: "Not configured" },
  error: { tone: "down", k: "trust.method.status.error", label: "Last update failed" },
  "not-run": { tone: "neutral", k: "trust.method.status.notRun", label: "Not loaded yet" },
};

const sourceColumns: Column<SourceInfo>[] = [
  {
    key: "name",
    header: <T k="trust.method.col.source" fallback="Source" />,
    cell: (s) => (
      <div className="max-w-xs whitespace-normal">
        {s.url ? (
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
            {s.name}
          </a>
        ) : (
          <span className="font-medium text-ink">{s.name}</span>
        )}
        <div className="text-xs text-muted">{s.publisher}</div>
        {s.note ? <div className="mt-0.5 text-xs text-muted">{s.note}</div> : null}
      </div>
    ),
  },
  { key: "licence", header: <T k="trust.method.col.licence" fallback="Licence / terms" />, cell: (s) => <span className="block max-w-[14rem] whitespace-normal text-sm">{s.licence}</span> },
  {
    key: "status",
    header: <T k="trust.method.col.status" fallback="Status" />,
    cell: (s) => (
      <Badge tone={STATUS[s.status]?.tone ?? "neutral"}>
        <T k={STATUS[s.status]?.k ?? "trust.method.status.notRun"} fallback={STATUS[s.status]?.label ?? s.status} />
      </Badge>
    ),
  },
  { key: "period", header: <T k="trust.method.col.period" fallback="Data to" />, cell: (s) => formatMonth(s.latestPeriod) },
  { key: "rows", header: <T k="trust.method.col.rows" fallback="Records" />, align: "right", cell: (s) => formatInt(s.rows) },
  { key: "fetched", header: <T k="trust.method.col.fetched" fallback="Fetched" />, cell: (s) => (s.fetchedAt ? s.fetchedAt.slice(0, 10) : "—") },
];

function RankingMethod({ id, children }: { id: ListId; children?: ReactNode }) {
  const def = LIST_DEFS[id];
  return (
    <Card>
      <CardBody>
        <h3 className="font-semibold text-ink">
          <Link href={`/lists/${id}/`} className="hover:underline">
            <T k={def.titleKey} fallback={def.title} />
          </Link>
        </h3>
        {children}
        <ul lang="en" className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-ink/90">
          {def.methodology.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          <T k="common.source" fallback="Source" />: <span lang="en">{def.source}</span>
        </p>
      </CardBody>
    </Card>
  );
}

const toc: { id: string; k: string; label: string }[] = [
  { id: "sources", k: "trust.method.sources", label: "Sources and coverage" },
  { id: "matching", k: "trust.method.matching", label: "How records become pages" },
  { id: "measures", k: "trust.method.measures", label: "Prices, areas and dates" },
  { id: "valuation", k: "trust.method.valuation", label: "Valuation estimates" },
  { id: "rankings", k: "trust.method.rankings", label: "Yields, growth and rankings" },
  { id: "supply-demand", k: "trust.method.supplyDemand", label: "Demand vs supply (MOP)" },
  { id: "enbloc", k: "trust.method.enbloc", label: "En-bloc potential" },
  { id: "lease", k: "trust.method.lease", label: "Lease decay and CPF" },
  { id: "rules", k: "trust.method.rules", label: "Stamp duty and loan rules" },
  { id: "limitations", k: "trust.method.limitations", label: "Limitations" },
];

export default function MethodologyPage() {
  const meta = getMeta();
  const c = meta.counts;
  const balaLoaded = Object.keys(BALA_TABLE).length > 0;
  const rules = rulesReferenceItems();
  const balaNote = RULE_META.bala.note;
  const contactEmail = configuredContactEmail();

  return (
    <PageContainer>
      <Breadcrumbs items={[{ label: "Methodology", k: "trust.method.title" }]} />
      <PageHeader
        title={<T k="trust.method.title" fallback="Methodology" />}
        description={<T k="trust.method.intro" fallback="Where our data comes from, how it is matched to properties, and how every derived figure is computed, including what it cannot tell you." />}
      />

      <nav aria-label="On this page" className="mb-8 rounded-xl border border-line bg-surface p-4">
        <p className="text-sm font-semibold text-ink">
          <T k="trust.onThisPage" fallback="On this page" />
        </p>
        <ol className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {toc.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-brand-700 hover:underline">
                <T k={s.k} fallback={s.label} />
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-10 pb-8">
        <section id="sources" aria-labelledby="sources-title" className="scroll-mt-24 space-y-4">
          <h2 id="sources-title" className="text-lg font-semibold text-ink sm:text-xl">
            <T k="trust.method.sources" fallback="Sources and coverage" />
          </h2>
          {meta.fixture ? (
            <Notice tone="warn" title={<T k="trust.method.fixtureTitle" fallback="Sample data" />}>
              <T k="trust.method.fixtureBody" fallback="This deployment is running on synthetic test data, so the sources and counts below describe the sample, not real government records." />
            </Notice>
          ) : null}
          {meta.sources.length === 0 ? (
            <Notice tone="warn">
              <T k="trust.method.noSnapshot" fallback="No dataset snapshot has been loaded on this deployment yet, so pages show empty states until the data pipeline runs." />
            </Notice>
          ) : (
            <Card>
              <DataTable columns={sourceColumns} rows={meta.sources} rowKey={(s) => s.id} />
            </Card>
          )}
          <Card>
            <CardBody>
              <StatGrid>
                <Stat label={<T k="trust.method.count.hdbTx" fallback="HDB resale sales" />} value={formatInt(c.hdbTransactions)} sub={meta.latestMonth.hdb ? <T k="trust.method.dataTo" fallback="to {month}" vars={{ month: formatMonth(meta.latestMonth.hdb) }} /> : undefined} />
                <Stat label={<T k="trust.method.count.hdbBlocks" fallback="HDB blocks" />} value={formatInt(c.hdbBlocks)} />
                <Stat label={<T k="trust.method.count.hdbRent" fallback="HDB rental records" />} value={formatInt(c.hdbRentals)} />
                <Stat
                  label={<T k="trust.method.count.privateTx" fallback="Private sales" />}
                  value={formatInt(c.privateTransactions)}
                  sub={meta.latestMonth.private ? <T k="trust.method.dataTo" fallback="to {month}" vars={{ month: formatMonth(meta.latestMonth.private) }} /> : undefined}
                />
                <Stat label={<T k="trust.method.count.condoTx" fallback="Condo and EC sales" />} value={formatInt(c.condoTransactions)} />
                <Stat label={<T k="trust.method.count.landedTx" fallback="Landed sales" />} value={formatInt(c.landedTransactions)} />
                <Stat label={<T k="trust.method.count.privateRent" fallback="Private rental contracts" />} value={formatInt(c.privateRentals)} />
                <Stat label={<T k="trust.method.count.projects" fallback="Private projects" />} value={formatInt(c.projects)} />
                <Stat label={<T k="trust.method.count.streets" fallback="Landed streets" />} value={formatInt(c.landedStreets)} />
                <Stat label={<T k="trust.method.count.addresses" fallback="Landed addresses" />} value={formatInt(c.landedAddresses)} />
                <Stat label={<T k="trust.method.count.launches" fallback="New launches" />} value={formatInt(c.launches)} />
                <Stat label={<T k="trust.method.count.mrt" fallback="MRT / LRT stations" />} value={formatInt(c.mrtStations)} />
              </StatGrid>
              {meta.generatedAt ? (
                <p className="mt-4 text-xs text-muted">
                  <T k="trust.method.generated" fallback="Snapshot generated {date}." vars={{ date: meta.generatedAt.slice(0, 10) }} />
                </p>
              ) : null}
            </CardBody>
          </Card>
          {c.privateTransactions === 0 ? (
            <Notice tone="warn" title={<T k="trust.method.noPrivateTitle" fallback="Private property data not loaded" />}>
              <T k="trust.method.noPrivateBody" fallback="URA private transactions need a URA Data Service access key. Without it, condo, EC and landed pages and rankings show empty states rather than estimates." />
            </Notice>
          ) : null}
          {c.landedAddresses === 0 && c.privateTransactions > 0 ? (
            <Notice>
              <T k="trust.method.noAddresses" fallback="Landed address pages need unit-level records (for example REALIS). URA's free data has no house numbers, so landed sales are shown by street." />
            </Notice>
          ) : null}
        </section>

        <LegalBody>
          <LegalSection id="matching" title={<T k="trust.method.matching" fallback="How records become pages" />}>
            <ul>
              <li>
                <strong>HDB blocks</strong> are identified by block number and street exactly as HDB records them, e.g. <code>{hdbBlockSlug("872A", "TAMPINES ST 86")}</code> for 872A
                Tampines St 86. Lease commencement comes from resale records (the most common value for the block); completion year, storeys, unit mix and facilities from HDB
                property information; location and postal code from OneMap.
              </li>
              <li>
                <strong>Condo and EC projects</strong> group URA transactions by the official project name: &ldquo;PEOPLE&rsquo;S PK COMPLEX&rdquo; becomes{" "}
                <code>{projectSlug("PEOPLE'S PK COMPLEX")}</code>. A project made up only of landed homes is shown as a landed street instead of a condo page.
              </li>
              <li>
                <strong>Landed streets</strong> group landed sales by street, with street types abbreviated: &ldquo;HAIG LANE&rdquo; becomes <code>{landedStreetSlug("HAIG LANE")}</code>.{" "}
                <strong>Landed addresses</strong> such as <code>{landedAddressSlug("13", "HAIG LANE")}</code> exist only where unit-level records with house numbers are available.
              </li>
              <li>
                <strong>New launches</strong> come from URA developer sales and the project pipeline, and link to the project page once transactions are recorded.
              </li>
              <li>
                <strong>Nearest MRT</strong> is the closest operational station by straight-line distance (station position averaged from its exits). Future stations come from LTA
                announcements; some positions are approximate and are flagged as such.
              </li>
            </ul>
          </LegalSection>

          <LegalSection id="measures" title={<T k="trust.method.measures" fallback="Prices, areas and dates" />}>
            <ul>
              <li>Prices are the transacted prices as published, in Singapore dollars. For bulk purchases URA reports the total price and total area of all units.</li>
              <li>
                Price per square foot (psf) = price ÷ (area in square metres × {SQFT_PER_SQM}). Areas are shown in square metres with square feet alongside.
              </li>
              <li>
                HDB resale months are approval months up to February 2012 and registration months from March 2012, as HDB publishes them. URA months are contract
                dates. &ldquo;Latest 12 months&rdquo; figures run to the dataset&rsquo;s latest month, not today.
              </li>
              <li>
                Remaining lease at sale is HDB&rsquo;s published figure where available (sales from 2015). Otherwise it is estimated as a {HDB_LEASE_YEARS}-year lease starting in the
                middle of the lease commencement year, and labelled as an estimate.
              </li>
              <li>Medians are used instead of averages so that a few unusual sales do not dominate.</li>
            </ul>
          </LegalSection>

          <LegalSection id="valuation" title={<T k="trust.method.valuation" fallback="Valuation estimates" />}>
            <p>Valuations use comparable recent sales:</p>
            <ol>
              <li>
                <strong>Comparables.</strong> HDB: same block and flat type in the last {HDB_LOOKBACK_MONTHS} months, widened to blocks within {NEARBY_RADIUS_M / 1000} km when the
                block has fewer than {MIN_SAME_SITE} sales. Condos: same project in the last {PRIVATE_LOOKBACK_MONTHS} months, widened to projects within {NEARBY_RADIUS_M / 1000} km in
                the same market segment (ECs only against ECs). Landed: same street, widened to the same landed type in the district. The window extends to {EXTENDED_LOOKBACK_MONTHS}{" "}
                months when sales are scarce; with fewer than {MIN_COMPARABLES} comparables no estimate is given.
              </li>
              <li>
                <strong>Time adjustment.</strong> Each sale&rsquo;s psf is moved to the latest month with a market index (the monthly median psf for the town and flat type, district or
                segment, smoothed over three months).
              </li>
              <li>
                <strong>Floor adjustment.</strong> {FLOOR_PREMIUM_PER_LEVEL * 100}% per floor of difference, a simple model assumption.
              </li>
              <li>
                <strong>Lease adjustment (HDB).</strong>{" "}
                {balaLoaded
                  ? `Differences in remaining lease between the flat and its comparables are adjusted with Bala's Table. ${balaNote}`
                  : "Not applied yet: comparables come from the same or nearby blocks, which usually have similar leases."}
              </li>
              <li>
                <strong>Estimate and range.</strong> The estimate is the median adjusted psf of up to {MAX_COMPARABLES_USED} of the closest, most recent comparables, times the floor
                area. The range is the middle half (25th to 75th percentile). Confidence is high only with at least 8 comparables, 4 of them in the last 12 months and 3 from the same
                block or project, and a tight spread.
              </li>
            </ol>
            <p>An estimate is not a professional valuation. Renovation, view, facing, unit layout and the current state of negotiations are not known to the model.</p>
          </LegalSection>
        </LegalBody>

        <section id="rankings" aria-labelledby="rankings-title" className="scroll-mt-24 space-y-3">
          <h2 id="rankings-title" className="text-lg font-semibold text-ink sm:text-xl">
            <T k="trust.method.rankings" fallback="Yields, growth and rankings" />
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <RankingMethod id="yield" />
            <RankingMethod id="growth" />
            <RankingMethod id="cheapest" />
            <RankingMethod id="newest" />
          </div>
        </section>

        <section id="supply-demand" aria-labelledby="supply-demand-title" className="scroll-mt-24 space-y-3">
          <h2 id="supply-demand-title" className="text-lg font-semibold text-ink sm:text-xl">
            <T k="trust.method.supplyDemand" fallback="Demand vs supply (MOP)" />
          </h2>
          <p lang="en" className="max-w-3xl text-[15px] leading-7 text-ink/90">
            HDB owners can sell their flat on the open market, or buy private property while keeping it, only after the Minimum Occupation Period ({HDB_MOP_YEARS} years for most
            flats). On property pages, demand counts HDB flats near the property reaching MOP in each year (completion year + {HDB_MOP_YEARS}); supply counts units in new launches and
            pipeline projects in the same radius by expected completion year.
          </p>
          <RankingMethod id="demand-supply" />
        </section>

        <section id="enbloc" aria-labelledby="enbloc-title" className="scroll-mt-24 space-y-3">
          <h2 id="enbloc-title" className="text-lg font-semibold text-ink sm:text-xl">
            <T k="trust.method.enbloc" fallback="En-bloc potential" />
          </h2>
          <RankingMethod id="enbloc" />
        </section>

        <LegalBody>
          <LegalSection id="lease" title={<T k="trust.method.lease" fallback="Lease decay and CPF" />}>
            <p>
              HDB flats and most condos are on {HDB_LEASE_YEARS}-year leases. Value tends to fall faster as the remaining lease shortens. The usual reference is Bala&rsquo;s Table, used
              by the Singapore Land Authority, which expresses the value of leasehold land as a share of its freehold value by years remaining. It is a valuation convention for land,
              not evidence of flat prices.{" "}
              {balaLoaded ? `Where we show a lease adjustment, it is approximate. ${balaNote}` : "We do not apply it to estimates yet; remaining lease is shown so you can weigh it yourself."}
            </p>
            <ul>
              <li>CPF savings cannot be used for a flat with less than {CPF_MIN_REMAINING_LEASE} years of lease left.</li>
              <li>
                Full CPF use needs the remaining lease to cover the youngest buyer to age {CPF_LEASE_COVER_AGE}; otherwise the amount is pro-rated.
              </li>
              <li>
                The Minimum Occupation Period is {HDB_MOP_YEARS} years for most flats and {HDB_MOP_YEARS_PLUS_PRIME} years for Plus and Prime flats.
              </li>
            </ul>
          </LegalSection>

          <LegalSection id="rules" title={<T k="trust.method.rules" fallback="Stamp duty and loan rules" />}>
            <p>
              The calculators (and the <Link href="/docs/">public API</Link>) use these rules. Each is defined once in the code with its source and effective date, so every tool uses the
              same values:
            </p>
            <ul>
              {rules.map((r) => (
                <li key={r.text}>
                  {r.text}{" "}
                  {r.indicative ? (
                    <Badge tone="warn">
                      {/* translated label inside the English-only section body */}
                      <PageLang>
                        <T k="trust.method.indicative" fallback="Indicative: check with {agency}" vars={{ agency: r.checkWith }} />
                      </PageLang>
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
            <p>
              Rules marked indicative have not yet been confirmed against the full official page, so results that depend on them are shown as indicative. Each rule&rsquo;s source and
              effective date are recorded in the code and shown next to calculator results.
            </p>
          </LegalSection>

          <LegalSection id="limitations" title={<T k="trust.method.limitations" fallback="Limitations" />}>
            <ul>
              <li>Government datasets are published with a delay and are sometimes revised. Figures reflect the snapshot date above, not today.</li>
              <li>URA&rsquo;s free data covers about five years and has no unit numbers, so older private history and unit-level analysis need licensed data.</li>
              <li>Rental records are approvals and contracts, not advertised asking rents, and URA reports private rents with floor-area bands.</li>
              <li>Matching by name and street can occasionally attach a sale to the wrong page, especially where projects or blocks were renamed.</li>
              <li>Estimates (valuations, yields, growth, lease figures, demand vs supply, en-bloc tiers) are models with stated assumptions, not forecasts or advice.</li>
            </ul>
            {contactEmail ? (
              <p>
                Found a mistake? Email <a href={`mailto:${contactEmail}`}>{contactEmail}</a> with the page link.
              </p>
            ) : null}
          </LegalSection>
        </LegalBody>
      </div>
    </PageContainer>
  );
}
