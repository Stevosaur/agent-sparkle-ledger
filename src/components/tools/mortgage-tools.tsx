"use client";

import { useMemo, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stat, StatGrid } from "@/components/ui/stat";
import { DataTable } from "@/components/ui/table";
import { Notice } from "@/components/ui/notice";
import { SimpleBarChart } from "@/components/charts/bar-chart";
import { LeadForm } from "@/components/leads/lead-form";
import { useT } from "@/lib/i18n/provider";
import { formatSgd } from "@/lib/format";
import { amortisationSchedule, monthlyPayment, refinanceSavings, totalInterest } from "@/lib/calc/mortgage";
import { NumberField, parseNum } from "./controls";

export interface RatePreset {
  label: string;
  value: number;
}

function clampYears(s: string, fallback: number, max = 35): number {
  const n = parseNum(s);
  if (n == null || n <= 0) return fallback;
  return Math.min(max, Math.max(1, Math.round(n)));
}

/** Rate field with quick-fill buttons for the data-backed reference rates. */
function RateField({ id, label, value, onChange, presets, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; presets: RatePreset[]; hint?: string }) {
  const t = useT();
  return (
    <div className="space-y-2">
      <NumberField id={id} label={label} value={value} onChange={onChange} suffix="% p.a." min={0} max={20} hint={hint} />
      {presets.length ? (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(String(p.value))}
              className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink hover:bg-canvas"
              aria-label={t("tools.mr.usePreset", "Use {name}: {v}%", { name: p.label, v: p.value })}
            >
              {p.label} {p.value}%
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function RepaymentCalculator({ presets, defaultRate }: { presets: RatePreset[]; defaultRate: number }) {
  const t = useT();
  const [loan, setLoan] = useState("500000");
  const [rate, setRate] = useState(String(defaultRate));
  const [years, setYears] = useState("25");
  const [showTable, setShowTable] = useState(false);
  const loanNum = Math.max(0, parseNum(loan) ?? 0);
  const rateNum = Math.max(0, parseNum(rate) ?? 0);
  const yearsNum = clampYears(years, 25);
  const schedule = useMemo(() => (loanNum > 0 ? amortisationSchedule(loanNum, rateNum, yearsNum) : []), [loanNum, rateNum, yearsNum]);
  const payment = monthlyPayment(loanNum, rateNum, yearsNum);
  const interest = loanNum > 0 ? totalInterest(loanNum, rateNum, yearsNum) : 0;
  const firstYear = schedule[0];

  return (
    <Card>
      <CardHeader title={t("tools.mr.repayTitle", "Repayment calculator")} description={t("tools.mr.repayDesc", "Monthly instalment, total interest and how the balance falls each year.")} />
      <CardBody className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField id="rep-loan" label={t("tools.mr.loanAmount", "Loan amount")} value={loan} onChange={setLoan} prefix="S$" min={0} />
          <RateField id="rep-rate" label={t("tools.mr.rate", "Interest rate")} value={rate} onChange={setRate} presets={presets} />
          <NumberField id="rep-years" label={t("tools.mr.tenure", "Tenure")} value={years} onChange={setYears} suffix={t("tools.aff.years", "years")} min={1} max={35} step={1} />
        </div>
        <StatGrid>
          <Stat label={t("tools.mr.monthly", "Monthly instalment")} value={formatSgd(payment)} />
          <Stat label={t("tools.mr.totalInterest", "Total interest")} value={formatSgd(interest)} />
          <Stat label={t("tools.mr.totalPaid", "Total repaid")} value={formatSgd(loanNum + interest)} />
          <Stat
            label={t("tools.mr.firstYearInterest", "Interest in year 1")}
            value={formatSgd(firstYear?.interest ?? 0)}
            sub={firstYear && firstYear.payment > 0 ? t("tools.mr.ofPayments", "{pct}% of payments", { pct: Math.round((firstYear.interest / firstYear.payment) * 100) }) : undefined}
          />
        </StatGrid>
        {schedule.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">{t("tools.mr.balanceChart", "Outstanding balance at the end of each year")}</h3>
            <SimpleBarChart
              data={schedule.map((r) => ({ label: `${r.year}`, value: Math.round(r.balance) }))}
              yFormat="sgdCompact"
              height={220}
              ariaLabel={t("tools.mr.balanceChartAria", "Bar chart of the loan balance remaining at the end of each year")}
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowTable((s) => !s)} aria-expanded={showTable} className="mt-2">
              {showTable ? t("tools.mr.hideSchedule", "Hide yearly schedule") : t("tools.mr.showSchedule", "Show yearly schedule")}
            </Button>
            {showTable ? (
              <DataTable
                dense
                rows={schedule}
                rowKey={(r) => String(r.year)}
                columns={[
                  { key: "y", header: t("tools.mr.colYear", "Year"), cell: (r) => r.year },
                  { key: "pay", header: t("tools.mr.colPaid", "Paid"), align: "right", cell: (r) => formatSgd(r.payment) },
                  { key: "int", header: t("tools.mr.colInterest", "Interest"), align: "right", cell: (r) => formatSgd(r.interest) },
                  { key: "pri", header: t("tools.mr.colPrincipal", "Principal"), align: "right", cell: (r) => formatSgd(r.principal) },
                  { key: "bal", header: t("tools.mr.colBalance", "Balance"), align: "right", cell: (r) => formatSgd(r.balance) },
                ]}
              />
            ) : null}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function RefinanceSaver({ presets, defaultNewRate }: { presets: RatePreset[]; defaultNewRate: number }) {
  const t = useT();
  const [balance, setBalance] = useState("400000");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState(String(defaultNewRate));
  const [years, setYears] = useState("20");
  const [fees, setFees] = useState("0");
  const [horizon, setHorizon] = useState("3");
  const balanceNum = Math.max(0, parseNum(balance) ?? 0);
  const currentNum = parseNum(current);
  const nextNum = parseNum(next);
  const yearsNum = clampYears(years, 20);
  const horizonNum = Math.min(yearsNum, clampYears(horizon, 3, 35));
  const ready = balanceNum > 0 && currentNum != null && currentNum >= 0 && nextNum != null && nextNum >= 0;
  const r = ready ? refinanceSavings(balanceNum, currentNum!, nextNum!, yearsNum, Math.max(0, parseNum(fees) ?? 0), horizonNum) : null;
  return (
    <Card>
      <CardHeader title={t("tools.mr.refiTitle", "Refinance saver")} description={t("tools.mr.refiDesc", "What moving your outstanding loan to a new rate would save, after fees.")} />
      <CardBody className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField id="refi-balance" label={t("tools.mr.balance", "Outstanding loan")} value={balance} onChange={setBalance} prefix="S$" min={0} />
          <NumberField id="refi-current" label={t("tools.mr.currentRate", "Current rate")} value={current} onChange={setCurrent} suffix="% p.a." min={0} max={20} hint={t("tools.mr.currentRateHint", "From your latest loan statement.")} />
          <RateField id="refi-new" label={t("tools.mr.newRate", "New rate")} value={next} onChange={setNext} presets={presets} />
          <NumberField id="refi-years" label={t("tools.mr.remaining", "Years remaining")} value={years} onChange={setYears} suffix={t("tools.aff.years", "years")} min={1} max={35} step={1} />
          <NumberField id="refi-fees" label={t("tools.mr.fees", "Switching costs")} value={fees} onChange={setFees} prefix="S$" min={0} hint={t("tools.mr.feesHint", "Legal and valuation fees, clawbacks, minus any subsidy.")} />
          <NumberField id="refi-horizon" label={t("tools.mr.horizon", "Compare over")} value={horizon} onChange={setHorizon} suffix={t("tools.aff.years", "years")} min={1} max={35} step={1} />
        </div>
        {r ? (
          <StatGrid>
            <Stat label={t("tools.mr.currentPayment", "Current instalment")} value={formatSgd(r.currentPayment)} />
            <Stat label={t("tools.mr.newPayment", "New instalment")} value={formatSgd(r.newPayment)} />
            <Stat label={t("tools.mr.monthlySaving", "Monthly saving")} value={formatSgd(r.monthlySaving)} tone={r.monthlySaving > 0 ? "up" : r.monthlySaving < 0 ? "down" : undefined} />
            <Stat
              label={t("tools.mr.interestSaved", "Interest saved over {n} years", { n: r.horizonYears })}
              value={formatSgd(r.interestSavedOverHorizon)}
              tone={r.interestSavedOverHorizon > 0 ? "up" : r.interestSavedOverHorizon < 0 ? "down" : undefined}
              sub={t("tools.mr.afterFees", "after switching costs")}
            />
          </StatGrid>
        ) : (
          <p className="text-sm text-muted">{t("tools.mr.refiNeed", "Enter your current and new rates to see the saving.")}</p>
        )}
        {r && r.interestSavedOverHorizon <= 0 && r.monthlySaving > 0 ? <Notice tone="warn">{t("tools.mr.refiNotWorth", "The switching costs outweigh the interest saved over this period.")}</Notice> : null}
      </CardBody>
    </Card>
  );
}

/** Mortgage adviser lead form (implemented by the leads package). */
export function MortgageAdviser() {
  const t = useT();
  return (
    <LeadForm
      type="mortgage"
      context={{ source: "mortgage-rates" }}
      title={t("tools.mr.adviserTitle", "Talk to a mortgage adviser")}
      description={t("tools.mr.adviserDesc", "Leave your details and an adviser will contact you with current bank packages for your loan.")}
      submitLabel={t("tools.mr.adviserSubmit", "Request a call back")}
    />
  );
}
