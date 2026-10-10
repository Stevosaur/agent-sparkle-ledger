"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/table";
import { Notice } from "@/components/ui/notice";
import { useT } from "@/lib/i18n/provider";
import { formatSgd } from "@/lib/format";
import { comparePackages, defaultHorizon, type MortgagePackageInput, type PackageComparison } from "@/lib/tools/package-compare";
import { NumberField, parseNum, Segmented } from "./controls";

const MAX_PACKAGES = 3;

interface Draft {
  id: string;
  name: string;
  kind: "fixed" | "sora";
  rate: string;
  lockIn: string;
  fees: string;
}

function newDraft(seq: number): Draft {
  return { id: `pkg-${seq}`, name: "", kind: seq % 2 === 1 ? "fixed" : "sora", rate: "", lockIn: "2", fees: "0" };
}

/**
 * Up to three user-entered packages compared on interest + fees. Floating packages assume today's
 * 3M compounded SORA stays flat (stated next to the results). All maths runs in the browser.
 */
export function PackageComparer({ sora3m, hdbRate }: { sora3m: { value: number; date: string } | null; hdbRate: number | null }) {
  const t = useT();
  const [loan, setLoan] = useState("500000");
  const [tenure, setTenure] = useState("25");
  const [drafts, setDrafts] = useState<Draft[]>(() => [newDraft(1), newDraft(2)]);
  const [seq, setSeq] = useState(3);
  const [horizon, setHorizon] = useState("");
  const [withHdb, setWithHdb] = useState(false);

  const loanNum = Math.max(0, parseNum(loan) ?? 0);
  const tenureNum = Math.min(35, Math.max(1, Math.round(parseNum(tenure) ?? 25)));
  const packages: MortgagePackageInput[] = drafts.map((d, i) => ({
    id: d.id,
    name: d.name.trim() || t("tools.mr.pkgDefaultName", "Package {n}", { n: i + 1 }),
    kind: d.kind,
    ratePct: parseNum(d.rate),
    lockInYears: Math.min(10, Math.max(0, Math.round(parseNum(d.lockIn) ?? 0))),
    fees: Math.max(0, parseNum(d.fees) ?? 0),
  }));
  if (withHdb && hdbRate != null) {
    packages.push({ id: "hdb", name: t("tools.mr.hdbLoanRef", "HDB loan (reference)"), kind: "fixed", ratePct: hdbRate, lockInYears: 0, fees: 0 });
  }
  const horizonParsed = parseNum(horizon);
  const horizonYears = horizonParsed != null && horizonParsed >= 1 ? Math.min(tenureNum, Math.round(horizonParsed)) : Math.min(tenureNum, defaultHorizon(packages));
  const results = comparePackages(loanNum, tenureNum, sora3m?.value ?? null, packages, horizonYears);
  const skipped = drafts.filter((d) => parseNum(d.rate) == null).length;
  const floatingWithoutSora = !sora3m && drafts.some((d) => d.kind === "sora");

  function update(id: string, patch: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  return (
    <Card>
      <CardHeader title={t("tools.mr.cmpTitle", "Compare packages")} description={t("tools.mr.cmpDesc", "Enter up to three quotes from banks or your adviser and compare what they cost over the same period.")} />
      <CardBody className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField id="cmp-loan" label={t("tools.mr.loanAmount", "Loan amount")} value={loan} onChange={setLoan} prefix="S$" min={0} />
          <NumberField id="cmp-tenure" label={t("tools.mr.tenure", "Tenure")} value={tenure} onChange={setTenure} suffix={t("tools.aff.years", "years")} min={1} max={35} step={1} />
          <NumberField
            id="cmp-horizon"
            label={t("tools.mr.horizon", "Compare over")}
            value={horizon}
            onChange={setHorizon}
            suffix={t("tools.aff.years", "years")}
            min={1}
            max={35}
            step={1}
            hint={t("tools.mr.horizonHint", "Blank = the longest lock-in ({n} years).", { n: defaultHorizon(packages) })}
          />
        </div>

        <ol className="grid gap-4 md:grid-cols-3">
          {drafts.map((d, i) => (
            <li key={d.id} className="space-y-3 rounded-lg border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`${d.id}-name`} className="text-sm font-semibold text-ink">
                  {t("tools.mr.pkgDefaultName", "Package {n}", { n: i + 1 })}
                </label>
                {drafts.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setDrafts((ds) => ds.filter((x) => x.id !== d.id))}
                    className="rounded-md p-1 text-muted hover:bg-canvas hover:text-down"
                    aria-label={t("tools.mr.removePkg", "Remove package {n}", { n: i + 1 })}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                ) : null}
              </div>
              <Input id={`${d.id}-name`} value={d.name} onChange={(e) => update(d.id, { name: e.target.value })} placeholder={t("tools.mr.pkgNamePh", "Bank / package name")} maxLength={40} />
              <Segmented
                label={t("tools.mr.pkgType", "Rate type")}
                value={d.kind}
                onChange={(v) => update(d.id, { kind: v })}
                options={[
                  { value: "fixed", label: t("tools.mr.fixed", "Fixed") },
                  { value: "sora", label: t("tools.mr.floating", "3M SORA +") },
                ]}
              />
              <NumberField
                id={`${d.id}-rate`}
                label={d.kind === "fixed" ? t("tools.mr.fixedRate", "Fixed rate") : t("tools.mr.spread", "Spread over 3M SORA")}
                value={d.rate}
                onChange={(v) => update(d.id, { rate: v })}
                suffix="%"
                min={d.kind === "fixed" ? 0 : -5}
                max={20}
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor={`${d.id}-lock`} className="block text-sm font-medium text-ink">
                    {t("tools.mr.lockIn", "Lock-in")}
                  </label>
                  <Select id={`${d.id}-lock`} value={d.lockIn} onChange={(e) => update(d.id, { lockIn: e.target.value })}>
                    {[0, 1, 2, 3, 4, 5].map((y) => (
                      <option key={y} value={String(y)}>
                        {y === 0 ? t("tools.mr.noLockIn", "None") : t("tools.aff.nYears", "{n} years", { n: y })}
                      </option>
                    ))}
                  </Select>
                </div>
                <NumberField id={`${d.id}-fees`} label={t("tools.mr.pkgFees", "Your costs")} value={d.fees} onChange={(v) => update(d.id, { fees: v })} prefix="S$" min={0} />
              </div>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center gap-4">
          {drafts.length < MAX_PACKAGES ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDrafts((ds) => [...ds, newDraft(seq)]);
                setSeq(seq + 1);
              }}
            >
              <Plus className="size-4" aria-hidden />
              {t("tools.mr.addPkg", "Add a package")}
            </Button>
          ) : null}
          {hdbRate != null ? (
            <label className="inline-flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={withHdb} onChange={(e) => setWithHdb(e.target.checked)} className="size-4 accent-brand-700" />
              {t("tools.mr.withHdb", "Include the HDB loan at {v}% for reference", { v: hdbRate })}
            </label>
          ) : null}
        </div>

        {floatingWithoutSora ? <Notice tone="warn">{t("tools.mr.noSora", "SORA rates are not loaded, so floating packages cannot be priced.")}</Notice> : null}

        {results.length ? (
          <PackageResults results={results} horizon={horizonYears} sora3m={sora3m} />
        ) : (
          <p className="text-sm text-muted">{t("tools.mr.cmpNeed", "Enter a rate for at least one package to compare.")}</p>
        )}
        {skipped > 0 && results.length ? <p className="text-xs text-muted">{t("tools.mr.cmpSkipped", "Packages without a rate are left out.")}</p> : null}
      </CardBody>
    </Card>
  );
}

function PackageResults({ results, horizon, sora3m }: { results: PackageComparison[]; horizon: number; sora3m: { value: number; date: string } | null }) {
  const t = useT();
  const sorted = [...results].sort((a, b) => a.rank - b.rank);
  const best = sorted[0];
  const runnerUp = sorted[1];
  return (
    <div className="space-y-3">
      <DataTable
        rows={sorted}
        rowKey={(r) => r.id}
        columns={[
          {
            key: "name",
            header: t("tools.mr.colPackage", "Package"),
            cell: (r) => (
              <div className="min-w-32">
                <span className="font-medium text-ink">{r.name}</span>
                {r.rank === 1 && results.length > 1 ? (
                  <Badge tone="up" className="ml-2">
                    {t("tools.mr.cheapest", "Cheapest")}
                  </Badge>
                ) : null}
              </div>
            ),
          },
          {
            key: "rate",
            header: t("tools.mr.colRate", "Rate"),
            align: "right",
            cell: (r) => `${r.effectiveRatePct.toFixed(2)}%${r.kind === "sora" ? "*" : ""}`,
          },
          { key: "monthly", header: t("tools.mr.colMonthly", "Monthly"), align: "right", cell: (r) => formatSgd(r.monthlyPayment) },
          { key: "lock", header: t("tools.mr.colLockIn", "Interest during lock-in"), align: "right", cell: (r) => (r.lockInYears > 0 ? `${formatSgd(r.interestOverLockIn)} (${r.lockInYears}y)` : "—") },
          { key: "int", header: t("tools.mr.colInterestN", "Interest, {n} yrs", { n: horizon }), align: "right", cell: (r) => formatSgd(r.interestOverHorizon) },
          { key: "fees", header: t("tools.mr.colFees", "Costs"), align: "right", cell: (r) => formatSgd(r.fees) },
          { key: "total", header: t("tools.mr.colTotal", "Total, {n} yrs", { n: horizon }), align: "right", cell: (r) => <span className="font-semibold">{formatSgd(r.costOverHorizon)}</span> },
        ]}
      />
      {best && runnerUp ? (
        <p className="text-sm text-ink">
          {t("tools.mr.cmpSummary", "{best} costs {diff} less than {next} over {n} years.", {
            best: best.name,
            diff: formatSgd(runnerUp.costOverHorizon - best.costOverHorizon),
            next: runnerUp.name,
            n: horizon,
          })}
        </p>
      ) : null}
      <p className="text-xs text-muted">
        {sora3m
          ? t("tools.mr.assumption", "* Floating rates assume 3M compounded SORA stays at {v}% (published {date}) for the whole period. SORA changes every day, so actual costs will differ.", {
              v: sora3m.value.toFixed(4).replace(/0+$/, "").replace(/\.$/, ""),
              date: sora3m.date,
            })
          : null}{" "}
        {t(
          "tools.mr.cmpNote",
          "Interest is computed on a standard monthly amortising loan, with each package's rate applied for the whole period, including any years after its lock-in or fixed term (most packages reprice then). Costs are the one-off amounts you entered.",
        )}
      </p>
    </div>
  );
}
