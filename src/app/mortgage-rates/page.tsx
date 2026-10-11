import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageContainer, PageHeader, Section } from "@/components/ui/section";
import { Card, CardBody } from "@/components/ui/card";
import { Stat, StatGrid } from "@/components/ui/stat";
import { EmptyState, Notice } from "@/components/ui/notice";
import { T } from "@/components/i18n/t";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { GatedPanel } from "@/components/gating/gated-panel";
import { MortgageAdviser, RefinanceSaver, RepaymentCalculator, type RatePreset } from "@/components/tools/mortgage-tools";
import { PackageComparer } from "@/components/tools/package-comparer";
import { getRates } from "@/lib/data/rates";
import { monthIndex } from "@/lib/data/months";
import type { DatedValue } from "@/lib/data/types";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 21600;

export const metadata = pageMetadata({
  title: "Mortgage rates today: SORA, HDB loan rate and repayment calculator",
  description:
    "Today's SORA (overnight, 1M, 3M and 6M compounded), the HDB concessionary loan rate and CPF OA rate, with a repayment calculator, refinance saver and package comparer.",
  path: "/mortgage-rates/",
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-30" -> "30 Sep 2026" */
function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso;
}

function pct(v: DatedValue | null): string {
  return v ? `${v.value.toFixed(4).replace(/0{1,2}$/, "")}%` : "—";
}

function seriesPoints(series: DatedValue[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const p of series) {
    try {
      out.push({ x: monthIndex(p.date.slice(0, 7)), y: p.value });
    } catch {
      /* skip malformed dates */
    }
  }
  return out.sort((a, b) => a.x - b.x);
}

export default function MortgageRatesPage() {
  const rates = getRates();
  const sora = rates?.sora ?? null;
  const hdb = rates?.hdbConcessionaryRate ?? null;
  const cpf = rates?.cpfOaRate ?? null;
  const presets: RatePreset[] = [];
  if (hdb) presets.push({ label: "HDB", value: hdb.value });
  if (sora?.compounded3m) presets.push({ label: "3M SORA", value: Number(sora.compounded3m.value.toFixed(4)) });
  const points = sora ? seriesPoints(sora.series3m) : [];

  return (
    <PageContainer className="space-y-10 pb-12">
      <div>
        <Breadcrumbs items={[{ label: "Mortgage rates", k: "nav.mortgage" }]} />
        <PageHeader
          eyebrow={<T k="tools.mr.eyebrow" fallback="Mortgage rates" />}
          title={<T k="tools.mr.title" fallback="Mortgage rates today" />}
          description={
            <T
              k="tools.mr.intro"
              fallback="The benchmark rates Singapore home loans are priced from, the HDB loan rate, and calculators for repayments, refinancing and comparing packages."
            />
          }
        />
      </div>

      <Section
        id="sora"
        title={<T k="tools.mr.soraTitle" fallback="SORA benchmark rates" />}
        description={<T k="tools.mr.soraDesc" fallback="Floating-rate home loans are priced as compounded SORA plus a fixed spread set by the bank." />}
      >
        {sora ? (
          <Card>
            <CardBody className="space-y-6">
              <StatGrid>
                <Stat label={<T k="tools.mr.soraOn" fallback="Overnight SORA" />} value={pct(sora.overnight)} sub={sora.overnight ? formatDate(sora.overnight.date) : undefined} />
                <Stat label={<T k="tools.mr.sora1m" fallback="1M compounded" />} value={pct(sora.compounded1m)} sub={sora.compounded1m ? formatDate(sora.compounded1m.date) : undefined} />
                <Stat label={<T k="tools.mr.sora3m" fallback="3M compounded" />} value={pct(sora.compounded3m)} sub={sora.compounded3m ? formatDate(sora.compounded3m.date) : undefined} />
                <Stat label={<T k="tools.mr.sora6m" fallback="6M compounded" />} value={pct(sora.compounded6m)} sub={sora.compounded6m ? formatDate(sora.compounded6m.date) : undefined} />
              </StatGrid>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-ink">
                  <T k="tools.mr.chartTitle" fallback="3M compounded SORA, monthly" />
                </h3>
                <TimeSeriesChart series={[{ name: "3M compounded SORA", points }]} yFormat="pctRaw" height={240} ariaLabel="Line chart of 3-month compounded SORA by month" />
              </div>
              <p className="text-xs text-muted">
                <T k="common.source" fallback="Source" />: {sora.source} · <T k="tools.mr.asOf" fallback="as of" /> {formatDate(rates!.asOf)}
              </p>
            </CardBody>
          </Card>
        ) : (
          <EmptyState title={<T k="tools.mr.noRates" fallback="Rates are not loaded yet" />}>
            <T k="tools.mr.noRatesBody" fallback="The SORA snapshot from the Monetary Authority of Singapore has not been fetched on this deployment." />
          </EmptyState>
        )}
      </Section>

      <Section id="hdb-cpf" title={<T k="tools.mr.hdbTitle" fallback="HDB loan and CPF rates" />}>
        {hdb && cpf ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardBody>
                <Stat label={<T k="tools.mr.hdbRate" fallback="HDB concessionary loan rate" />} value={`${hdb.value}%`} sub={<><T k="tools.mr.since" fallback="since" /> {formatDate(hdb.date)}</>} />
                <p className="mt-3 text-sm text-muted">
                  <T k="tools.mr.hdbExplain" fallback="Pegged at 0.1% above the CPF Ordinary Account rate and reviewed quarterly. Available only for HDB flats to eligible buyers." />
                </p>
                <p className="mt-2 text-xs text-muted">
                  <T k="common.source" fallback="Source" />: {hdb.source}
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <Stat label={<T k="tools.mr.cpfRate" fallback="CPF Ordinary Account rate" />} value={`${cpf.value}%`} sub={<><T k="tools.mr.since" fallback="since" /> {formatDate(cpf.date)}</>} />
                <p className="mt-3 text-sm text-muted">
                  <T k="tools.mr.cpfExplain" fallback="What your CPF OA savings earn. Using OA savings for a home gives up this interest, and the amount used plus accrued interest is refunded to CPF when you sell." />
                </p>
                <p className="mt-2 text-xs text-muted">
                  <T k="common.source" fallback="Source" />: {cpf.source}
                </p>
              </CardBody>
            </Card>
          </div>
        ) : (
          <EmptyState title={<T k="tools.mr.noRates" fallback="Rates are not loaded yet" />} />
        )}
      </Section>

      <Section id="packages-explained" title={<T k="tools.mr.explainTitle" fallback="SORA-pegged or fixed?" />}>
        <Card>
          <CardBody className="space-y-3 text-sm text-ink">
            <p>
              <T
                k="tools.mr.explainSora"
                fallback="SORA-pegged (floating) packages charge compounded SORA plus a spread fixed by the bank, e.g. 3M SORA plus a margin. The rate is reset periodically (every one or three months, depending on the package), so your instalment falls when SORA falls and rises when it rises."
              />
            </p>
            <p>
              <T
                k="tools.mr.explainFixed"
                fallback="Fixed packages lock the rate for the first few years (commonly two or three), then usually revert to a floating rate. You get a predictable instalment, but you do not benefit if rates fall during the fixed period."
              />
            </p>
            <p>
              <T
                k="tools.mr.explainLockIn"
                fallback="Most bank packages have a lock-in: repaying or refinancing within it costs a penalty, commonly a percentage of the amount redeemed. Compare the total cost over the lock-in, including legal and valuation fees and any subsidy clawback."
              />
            </p>
            <Notice>
              <T
                k="tools.mr.noBankFeed"
                fallback="We do not list individual bank rates: there is no public feed of bank packages, and quotes change weekly. Ask banks or an adviser for current quotes, then compare them below."
              />
            </Notice>
          </CardBody>
        </Card>
      </Section>

      <Section id="repayment" title={<T k="tools.mr.toolsTitle" fallback="Calculators" />}>
        <div className="space-y-6">
          <RepaymentCalculator presets={presets} defaultRate={hdb?.value ?? sora?.compounded3m?.value ?? 0} />
          <RefinanceSaver presets={presets} defaultNewRate={sora?.compounded3m?.value ?? hdb?.value ?? 0} />
        </div>
      </Section>

      <Section id="compare-packages" title={<T k="tools.mr.cmpSectionTitle" fallback="Package comparer" />}>
        <GatedPanel feature="mortgage.compare" minHeight={220}>
          <PackageComparer sora3m={sora?.compounded3m ? { value: sora.compounded3m.value, date: sora.compounded3m.date } : null} hdbRate={hdb?.value ?? null} />
        </GatedPanel>
      </Section>

      <section id="adviser" aria-label="Mortgage adviser">
        <MortgageAdviser />
      </section>
    </PageContainer>
  );
}
