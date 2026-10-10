"use client";

import { useMemo, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { useT } from "@/lib/i18n/provider";
import { formatPct, formatSgd } from "@/lib/format";
import { affordability, type AffordabilityInput, type AffordabilityResult } from "@/lib/calc/affordability";
import { bankLtv, hdbLoanLtv, hdbLoanMaxTenure, maxBankTenure, maxServiceableLoan, maxTenureForStandardLtv, msrApplies, type PropertyClass } from "@/lib/calc/loan";
import { monthlyPayment } from "@/lib/calc/mortgage";
import { BANK_STRESS_RATE_PCT, HDB_LOAN_AGE_LIMIT, HDB_LOAN_MAX_TENURE, HDB_LOAN_RATE_PCT, MSR_LIMIT, TDSR_LIMIT, type BuyerProfile } from "@/lib/calc/rules";
import { BreakdownRow, NumberField, parseNum, Segmented } from "./controls";
import { HomesThatFit } from "./homes-that-fit";
import { SaveCalculation } from "./save-calculation";

type Mode = "budget" | "income";

export interface AffordabilityDefaults {
  /** today's 3M compounded SORA (% p.a.) and its date, from the rates snapshot */
  sora3m: { value: number; date: string } | null;
}

function num(s: string, fallback = 0): number {
  const n = parseNum(s);
  return n == null || n < 0 ? fallback : n;
}

export function AffordabilityTool({ defaults }: { defaults: AffordabilityDefaults }) {
  const t = useT();
  const [mode, setMode] = useState<Mode>("budget");
  // shared inputs
  const [income, setIncome] = useState("10000");
  const [debts, setDebts] = useState("0");
  const [age, setAge] = useState("35");
  const [cls, setCls] = useState<PropertyClass>("hdb");
  const [lenderPick, setLenderPick] = useState<"hdb" | "bank">("hdb");
  const [tenure, setTenure] = useState("25");
  const [outstanding, setOutstanding] = useState("0");
  const defaultBankRate = defaults.sora3m?.value ?? BANK_STRESS_RATE_PCT;
  const [rate, setRate] = useState(String(defaultBankRate));
  // budget-only inputs
  const [cash, setCash] = useState("100000");
  const [cpf, setCpf] = useState("100000");
  const [profile, setProfile] = useState<BuyerProfile>("SC");
  const [count, setCount] = useState("1");

  const lender: "hdb" | "bank" = cls === "hdb" ? lenderPick : "bank";
  const ageNum = Math.min(Math.max(21, Math.round(num(age, 35))), 99);
  // HDB loans run at most 25 years and end by age 65; bank loans 30 (HDB flat) / 35 years
  const hdbTenureCap = hdbLoanMaxTenure(HDB_LOAN_MAX_TENURE, ageNum);
  const hdbLoanTooOld = lender === "hdb" && hdbTenureCap <= 0;
  const maxTenure = lender === "hdb" ? Math.max(1, hdbTenureCap) : maxBankTenure(cls);
  const tenureYears = Math.min(Math.max(1, Math.round(num(tenure, 25))), maxTenure);
  const ratePct = lender === "hdb" ? HDB_LOAN_RATE_PCT : num(rate, defaultBankRate);
  const outstandingNum = Math.min(2, Math.max(0, Math.round(num(outstanding, 0))));

  const input: AffordabilityInput = useMemo(
    () => ({
      cash: num(cash),
      cpfOa: num(cpf),
      monthlyIncome: num(income),
      monthlyDebts: num(debts),
      age: ageNum,
      propertyClass: cls,
      lender,
      buyerProfile: profile,
      propertyCount: Math.min(3, Math.max(1, Math.round(num(count, 1)))),
      outstandingLoans: outstandingNum,
      tenureYears,
      interestRatePct: ratePct,
    }),
    [cash, cpf, income, debts, ageNum, cls, lender, profile, count, outstandingNum, tenureYears, ratePct],
  );
  const result = useMemo(() => affordability(input), [input]);

  const classOptions: { value: PropertyClass; label: string }[] = [
    { value: "hdb", label: t("tools.aff.clsHdb", "HDB flat") },
    { value: "ec-new", label: t("tools.aff.clsEcNew", "EC (new, from developer)") },
    { value: "ec-resale", label: t("tools.aff.clsEcResale", "EC (resale)") },
    { value: "private", label: t("tools.aff.clsPrivate", "Private condo / landed") },
  ];

  const eligibilityWarning =
    profile === "FOREIGNER" && (cls === "hdb" || cls === "ec-new")
      ? t("tools.aff.foreignerWarn", "Foreigners cannot buy HDB flats or new ECs. Resale ECs can be bought by foreigners only after they are privatised (10 years after completion).")
      : profile === "SPR" && cls === "ec-new"
        ? t("tools.aff.sprEcWarn", "New ECs are sold only to households with at least one Singapore Citizen.")
        : null;

  const loanSection = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <label htmlFor="aff-class" className="block text-sm font-medium text-ink">
          {t("tools.aff.propertyClass", "Property type")}
        </label>
        <Select id="aff-class" value={cls} onChange={(e) => setCls(e.target.value as PropertyClass)}>
          {classOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <Segmented
        className="sm:col-span-2"
        label={t("tools.aff.lender", "Loan from")}
        value={lender}
        onChange={(v) => setLenderPick(v)}
        options={[
          { value: "hdb", label: t("tools.aff.lenderHdb", "HDB loan"), disabled: cls !== "hdb" },
          { value: "bank", label: t("tools.aff.lenderBank", "Bank loan") },
        ]}
      />
      <NumberField
        id="aff-tenure"
        label={t("tools.aff.tenure", "Loan tenure")}
        value={tenure}
        onChange={setTenure}
        suffix={t("tools.aff.years", "years")}
        min={1}
        max={maxTenure}
        step={1}
        hint={t("tools.aff.tenureHint", "Up to {n} years for this loan.", { n: hdbLoanTooOld ? 0 : maxTenure })}
      />
      <NumberField
        id="aff-rate"
        label={t("tools.aff.rate", "Interest rate")}
        value={lender === "hdb" ? String(HDB_LOAN_RATE_PCT) : rate}
        onChange={setRate}
        suffix="% p.a."
        min={0}
        max={20}
        disabled={lender === "hdb"}
        hint={
          lender === "hdb"
            ? t("tools.aff.rateHdbHint", "HDB concessionary rate (CPF OA rate + 0.1%).")
            : defaults.sora3m
              ? t("tools.aff.rateBankHint", "Defaults to today's 3M compounded SORA ({v}%). Add your bank's spread for a realistic instalment.", { v: defaults.sora3m.value.toFixed(2) })
              : t("tools.aff.rateBankHintNoSora", "Enter the rate your bank quoted.")
        }
      />
      <NumberField id="aff-age" label={t("tools.aff.age", "Age")} value={age} onChange={setAge} min={21} max={99} step={1} hint={t("tools.aff.ageHint", "Income-weighted average age of the borrowers.")} />
      <div className="space-y-1.5">
        <label htmlFor="aff-outstanding" className="block text-sm font-medium text-ink">
          {t("tools.aff.outstanding", "Other housing loans outstanding")}
        </label>
        <Select id="aff-outstanding" value={String(outstandingNum)} onChange={(e) => setOutstanding(e.target.value)} disabled={lender === "hdb"}>
          <option value="0">0</option>
          <option value="1">1</option>
          <option value="2">2+</option>
        </Select>
      </div>
    </div>
  );

  const incomeSection = (
    <div className="grid gap-4 sm:grid-cols-2">
      <NumberField id="aff-income" label={t("tools.aff.income", "Gross monthly income")} value={income} onChange={setIncome} prefix="S$" min={0} hint={t("tools.aff.incomeHint", "All borrowers combined. Banks count only 70% of variable income.")} />
      <NumberField id="aff-debts" label={t("tools.aff.debts", "Monthly debt repayments")} value={debts} onChange={setDebts} prefix="S$" min={0} hint={t("tools.aff.debtsHint", "Car loans, other mortgages, minimum card payments.")} />
    </div>
  );

  return (
    <div className="space-y-6">
      <Segmented
        label={t("tools.aff.modeLabel", "Start from")}
        value={mode}
        onChange={setMode}
        options={[
          { value: "budget", label: t("tools.aff.modeBudget", "From my budget") },
          { value: "income", label: t("tools.aff.modeIncome", "From my income") },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title={t("tools.aff.inputsTitle", "Your numbers")} />
          <CardBody className="space-y-6">
            {mode === "budget" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField id="aff-cash" label={t("tools.aff.cash", "Cash savings for the purchase")} value={cash} onChange={setCash} prefix="S$" min={0} />
                <NumberField id="aff-cpf" label={t("tools.aff.cpf", "CPF Ordinary Account")} value={cpf} onChange={setCpf} prefix="S$" min={0} />
                <div className="space-y-1.5">
                  <label htmlFor="aff-profile" className="block text-sm font-medium text-ink">
                    {t("tools.aff.profile", "Buyer profile")}
                  </label>
                  <Select id="aff-profile" value={profile} onChange={(e) => setProfile(e.target.value as BuyerProfile)}>
                    <option value="SC">{t("tools.aff.sc", "Singapore Citizen")}</option>
                    <option value="SPR">{t("tools.aff.spr", "Permanent Resident")}</option>
                    <option value="FOREIGNER">{t("tools.aff.foreigner", "Foreigner")}</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="aff-count" className="block text-sm font-medium text-ink">
                    {t("tools.aff.count", "Homes owned after this purchase")}
                  </label>
                  <Select id="aff-count" value={count} onChange={(e) => setCount(e.target.value)}>
                    <option value="1">{t("tools.aff.count1", "1 (this is my first)")}</option>
                    <option value="2">2</option>
                    <option value="3">3+</option>
                  </Select>
                </div>
              </div>
            ) : null}
            {incomeSection}
            {loanSection}
            {eligibilityWarning ? <Notice tone="warn">{eligibilityWarning}</Notice> : null}
            {hdbLoanTooOld ? (
              <Notice tone="warn">{t("tools.aff.hdbLoanAge", "An HDB loan must be repaid by age {age}, so it is not available at this age. Choose a bank loan instead.", { age: HDB_LOAN_AGE_LIMIT })}</Notice>
            ) : null}
          </CardBody>
        </Card>

        {mode === "budget" ? <BudgetResult input={input} result={result} /> : <IncomeResult cls={cls} lender={lender} income={num(income)} debts={num(debts)} tenureYears={tenureYears} ratePct={ratePct} age={ageNum} outstanding={outstandingNum} />}
      </div>

      {mode === "budget" ? <HomesThatFit maxPrice={result.maxPrice} defaultKind={cls === "hdb" ? "hdb" : "condo"} /> : null}
    </div>
  );
}

function BudgetResult({ input, result }: { input: AffordabilityInput; result: AffordabilityResult }) {
  const t = useT();
  const absdRate = result.maxPrice > 0 ? result.absd / result.maxPrice : 0;
  const bindingText =
    result.maxPrice <= 0
      ? t("tools.aff.bindingNone", "With these numbers no purchase is possible. Check your cash, CPF and income.")
      : result.binding === "servicing"
        ? t("tools.aff.bindingServicing", "Your income limits the loan (TDSR / MSR). More cash or CPF would raise your budget; a longer tenure or fewer debts would raise the loan.")
        : result.fundsLimitedBy === "cash"
          ? t("tools.aff.bindingCash", "Your cash limits the price: the minimum cash downpayment and stamp duties must be paid in cash, and some of your CPF is left unused.")
          : t("tools.aff.bindingFunds", "Your cash and CPF limit the price: the loan is capped at {ltv} of the price, so the rest (plus stamp duty) must come from your savings.", { ltv: formatPct(result.ltv, 0) });
  const standardLtvYears = input.lender === "bank" ? maxTenureForStandardLtv(input.propertyClass, input.age) : null;
  return (
    <Card>
      <CardHeader title={t("tools.aff.resultTitle", "What you can afford")} />
      <CardBody className="space-y-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">{t("tools.aff.maxPrice", "Maximum price")}</div>
          <div className="tabular mt-1 text-3xl font-bold text-ink">{formatSgd(result.maxPrice)}</div>
          <p className="mt-1 text-sm text-muted">{bindingText}</p>
        </div>
        <dl>
          <BreakdownRow
            label={t("tools.aff.loan", "Loan")}
            sub={
              result.ltvReduced && standardLtvYears != null
                ? t("tools.aff.ltvReducedSub", "Loan-to-value limit {ltv}: the lower limit applies because the loan runs longer than {n} years or past age 65", { ltv: formatPct(result.ltv, 0), n: standardLtvYears })
                : t("tools.aff.ltvSub", "Loan-to-value limit {ltv}", { ltv: formatPct(result.ltv, 0) })
            }
            value={formatSgd(result.loan)}
            strong
          />
          <BreakdownRow label={t("tools.aff.downpayment", "Downpayment")} value={formatSgd(result.downpayment)} strong />
          <BreakdownRow label={t("tools.aff.minCash", "Minimum cash portion")} value={formatSgd(result.minCash)} />
          <BreakdownRow label={t("tools.aff.cpfUsed", "Paid from CPF OA")} value={formatSgd(result.cpfUsed)} />
          <BreakdownRow label={t("tools.aff.bsd", "Buyer's Stamp Duty")} value={formatSgd(result.bsd)} />
          <BreakdownRow
            label={t("tools.aff.absd", "Additional Buyer's Stamp Duty")}
            sub={result.absd > 0 ? t("tools.aff.absdRate", "{rate} of the price", { rate: formatPct(absdRate, 0) }) : undefined}
            value={formatSgd(result.absd)}
          />
          <BreakdownRow label={t("tools.aff.cashUsed", "Cash needed (incl. stamp duties)")} value={formatSgd(result.cashUsed)} strong />
          <BreakdownRow
            label={t("tools.aff.monthly", "Monthly instalment")}
            sub={t("tools.aff.monthlySub", "{rate}% over {n} years", { rate: input.lender === "hdb" ? HDB_LOAN_RATE_PCT : input.interestRatePct, n: result.tenureYears })}
            value={formatSgd(result.monthlyPayment)}
            strong
          />
          <BreakdownRow
            label={t("tools.aff.maxServiceable", "Largest loan your income supports")}
            sub={t("tools.aff.stressSub", "Tested at {rate}% as MAS / HDB require", { rate: result.stressRatePct })}
            value={formatSgd(result.maxServiceableLoan)}
          />
          <BreakdownRow label={t("tools.aff.leftOver", "Left over: cash / CPF")} value={`${formatSgd(result.cashLeft)} / ${formatSgd(result.cpfLeft)}`} />
        </dl>
        <p className="text-xs text-muted">{t("tools.aff.dutyCashNote", "Stamp duties are counted as a cash cost.")}</p>
        <SaveCalculation input={input} result={result} />
        <p className="text-xs text-muted">
          {t("tools.aff.rulesSource", "Rules: MAS TDSR {tdsr} and MSR {msr}, MAS LTV limits, IRAS stamp duty rates, HDB loan terms. Estimates only; your bank or HDB decides the final loan.", {
            tdsr: formatPct(TDSR_LIMIT, 0),
            msr: formatPct(MSR_LIMIT, 0),
          })}
        </p>
      </CardBody>
    </Card>
  );
}

function IncomeResult({ cls, lender, income, debts, tenureYears, ratePct, age, outstanding }: { cls: PropertyClass; lender: "hdb" | "bank"; income: number; debts: number; tenureYears: number; ratePct: number; age: number; outstanding: number }) {
  const t = useT();
  const serv = maxServiceableLoan({ monthlyIncome: income, monthlyDebts: debts, propertyClass: cls, tenureYears, thereafterRatePct: ratePct, borrowerAge: age }, lender);
  const ltv = lender === "hdb" ? hdbLoanLtv() : bankLtv(cls, outstanding, serv.tenureYears, age).ltv;
  const priceSupported = ltv > 0 ? serv.maxLoan / ltv : 0;
  const instalmentAtRate = monthlyPayment(serv.maxLoan, ratePct, serv.tenureYears);
  const msr = msrApplies(cls) || lender === "hdb";
  return (
    <Card>
      <CardHeader title={t("tools.aff.incomeResultTitle", "How much you can borrow")} />
      <CardBody className="space-y-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">{t("tools.aff.maxLoan", "Maximum loan")}</div>
          <div className="tabular mt-1 text-3xl font-bold text-ink">{formatSgd(serv.maxLoan)}</div>
          <p className="mt-1 text-sm text-muted">
            {serv.binding === "msr"
              ? t("tools.aff.msrBinding", "Limited by the Mortgage Servicing Ratio: the instalment may not exceed {msr} of income.", { msr: formatPct(MSR_LIMIT, 0) })
              : t("tools.aff.tdsrBinding", "Limited by the Total Debt Servicing Ratio: all debt repayments may not exceed {tdsr} of income.", { tdsr: formatPct(TDSR_LIMIT, 0) })}
          </p>
        </div>
        <dl>
          <BreakdownRow label={t("tools.aff.maxInstalment", "Largest monthly instalment allowed")} value={formatSgd(serv.maxInstalment)} strong />
          <BreakdownRow label={t("tools.aff.stressRate", "Stress-test interest rate")} value={`${serv.stressRatePct}%`} />
          <BreakdownRow label={t("tools.aff.tenureUsed", "Tenure used")} value={t("tools.aff.nYears", "{n} years", { n: serv.tenureYears })} />
          <BreakdownRow label={t("tools.aff.limits", "Limits applied")} value={msr ? `TDSR ${formatPct(TDSR_LIMIT, 0)} · MSR ${formatPct(MSR_LIMIT, 0)}` : `TDSR ${formatPct(TDSR_LIMIT, 0)}`} />
          <BreakdownRow
            label={t("tools.aff.instalmentAtRate", "Instalment on this loan at your rate")}
            sub={t("tools.aff.monthlySub", "{rate}% over {n} years", { rate: ratePct, n: serv.tenureYears })}
            value={formatSgd(instalmentAtRate)}
          />
          <BreakdownRow
            label={t("tools.aff.priceSupported", "Price this loan supports")}
            sub={t("tools.aff.priceSupportedSub", "At {ltv} loan-to-value, if you have the downpayment", { ltv: formatPct(ltv, 0) })}
            value={formatSgd(priceSupported)}
            strong
          />
        </dl>
        <p className="text-xs text-muted">
          {t("tools.aff.incomeSource", "Rules: MAS TDSR and MSR with the MAS / HDB medium-term interest rate floors, MAS LTV limits. Your lender may apply further haircuts to variable income.")}
        </p>
      </CardBody>
    </Card>
  );
}
