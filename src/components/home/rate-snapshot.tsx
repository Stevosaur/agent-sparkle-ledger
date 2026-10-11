import { ArrowRight } from "lucide-react";
import type { RatesSnapshot } from "@/lib/data/types";
import { formatIsoDate } from "@/lib/home-insights";
import { T } from "@/components/i18n/t";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { ButtonLink } from "@/components/ui/button";
import { SourceLine } from "./source-line";

function usableRates(rates: RatesSnapshot | null) {
  const sora = rates?.sora?.compounded3m && Number.isFinite(rates.sora.compounded3m.value) ? rates.sora.compounded3m : null;
  const hdb = rates?.hdbConcessionaryRate && Number.isFinite(rates.hdbConcessionaryRate.value) ? rates.hdbConcessionaryRate : null;
  return { sora, hdb };
}

/** True when there is at least one rate to show. */
export function hasRateSnapshot(rates: RatesSnapshot | null): boolean {
  const { sora, hdb } = usableRates(rates);
  return !!(sora || hdb);
}

/** Mortgage-rate snapshot: 3M compounded SORA and the HDB concessionary rate. Renders nothing without rates. */
export function RateSnapshot({ rates, className }: { rates: RatesSnapshot | null; className?: string }) {
  const { sora, hdb } = usableRates(rates);
  if (!rates || (!sora && !hdb)) return null;
  const sources = [...new Set([sora ? rates.sora.source : null, hdb ? hdb.source : null].filter((s): s is string => !!s))];

  return (
    <Card className={className}>
      <CardHeader title={<T k="home.rates.title" fallback="Mortgage rates" />} description={<T k="home.rates.desc" fallback="The benchmarks most home loans are priced from." />} />
      <CardBody>
        <div className="grid grid-cols-2 gap-4">
          {sora ? (
            <Stat
              label={<T k="home.rates.sora3m" fallback="3M compounded SORA" />}
              value={`${sora.value.toFixed(2)}%`}
              sub={<T k="home.rates.asOf" fallback="as of {date}" vars={{ date: formatIsoDate(sora.date) }} />}
            />
          ) : null}
          {hdb ? (
            <Stat
              label={<T k="home.rates.hdb" fallback="HDB concessionary rate" />}
              value={`${hdb.value.toFixed(2)}%`}
              sub={<T k="home.rates.effective" fallback="effective {date}" vars={{ date: formatIsoDate(hdb.date) }} />}
            />
          ) : null}
        </div>
        <ButtonLink href="/mortgage-rates/" variant="secondary" size="sm" className="mt-4">
          <T k="home.rates.cta" fallback="Compare mortgage rates" />
          <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
        {sources.length > 0 ? <SourceLine>{sources.join("; ")}</SourceLine> : null}
      </CardBody>
    </Card>
  );
}
