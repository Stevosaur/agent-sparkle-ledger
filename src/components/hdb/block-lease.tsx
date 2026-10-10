import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, Notice } from "@/components/ui/notice";
import { Stat, StatGrid } from "@/components/ui/stat";
import { T } from "@/components/i18n/t";
import { formatLeaseMonths, formatPct } from "@/lib/format";
import { CPF_LEASE_COVER_AGE, CPF_MIN_REMAINING_LEASE } from "@/lib/calc/rules";
import type { LeaseOutlook } from "@/lib/hdb-insights";
import { SourceLine } from "./source-line";

const years = (y: number) => formatLeaseMonths(Math.floor(y * 12));

/** Section 9 body: remaining lease today and in 10 / 20 years, Bala's Table context and CPF usage. */
export function BlockLease({ outlook }: { outlook: LeaseOutlook | null }) {
  if (!outlook) {
    return (
      <EmptyState title={<T k="hdb.lease.unknownTitle" fallback="Lease start not known yet" />}>
        <T k="hdb.lease.unknown" fallback="HDB publishes the lease commencement year with resale records; this block has no resale yet, so its remaining lease cannot be shown (HDB resale prices, data.gov.sg)." />
      </EmptyState>
    );
  }
  const { cpf, bala } = outlook;
  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <StatGrid className="lg:grid-cols-3">
            <Stat
              label={<T k="hdb.lease.today" fallback="Lease left today" />}
              value={years(outlook.remainingToday)}
              sub={<T k="hdb.lease.ends" fallback="99-year lease from {start}, ends around {end}" vars={{ start: outlook.leaseCommenceYear, end: outlook.expiryYear }} />}
            />
            <Stat
              label={<T k="hdb.lease.in10" fallback="In 10 years" />}
              value={years(outlook.remainingIn10)}
              sub={bala ? <T k="hdb.lease.balaRel" fallback="≈{pct} of today's lease value (Bala's Table)" vars={{ pct: formatPct(bala.relIn10, 0) }} /> : null}
            />
            <Stat
              label={<T k="hdb.lease.in20" fallback="In 20 years" />}
              value={years(outlook.remainingIn20)}
              sub={bala ? <T k="hdb.lease.balaRel" fallback="≈{pct} of today's lease value (Bala's Table)" vars={{ pct: formatPct(bala.relIn20, 0) }} /> : null}
            />
          </StatGrid>
          <p className="mt-4 text-xs text-muted">
            <T k="hdb.lease.assumption" fallback="HDB publishes only the year a lease commenced, so remaining lease assumes a mid-year start and is approximate." />
            {bala ? (
              <>
                {" "}
                <T
                  k="hdb.lease.balaNote"
                  fallback="Bala's Table (SLA) values land leases, not flat prices; it is shown only as a guide to how lease decay accelerates. Reproduction of the table is approximate."
                />
              </>
            ) : null}
          </p>
        </CardBody>
      </Card>

      <Notice title={<T k="hdb.lease.cpfTitle" fallback="Using CPF for this flat" />}>
        {!cpf.allowed ? (
          <T
            k="hdb.lease.cpfNone"
            fallback="CPF savings cannot be used: the remaining lease is below {min} years."
            vars={{ min: CPF_MIN_REMAINING_LEASE }}
          />
        ) : cpf.full ? (
          <T
            k="hdb.lease.cpfFull"
            fallback="A youngest buyer aged {age} can use CPF in full (up to the Valuation Limit): the remaining lease covers them to age {cover}."
            vars={{ age: cpf.buyerAge, cover: CPF_LEASE_COVER_AGE }}
          />
        ) : (
          <T
            k="hdb.lease.cpfPartial"
            fallback="A youngest buyer aged {age} needs {needed} years of lease to reach age {cover}, so CPF use is pro-rated to about {share} of the Valuation Limit."
            vars={{ age: cpf.buyerAge, needed: cpf.yearsNeededForFullUse, cover: CPF_LEASE_COVER_AGE, share: formatPct(cpf.shareOfValuationLimit, 0) }}
          />
        )}{" "}
        <T k="hdb.lease.cpfAssumption" fallback="Assumes the youngest buyer is {age} and buys today; older buyers need less lease." vars={{ age: cpf.buyerAge }} />
      </Notice>
      <SourceLine>
        <T k="hdb.source.lease" fallback="HDB lease commencement (resale records, data.gov.sg); CPF Board rules on using CPF for property with shorter leases." />
      </SourceLine>
    </div>
  );
}
