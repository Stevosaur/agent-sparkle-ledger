"use client";

import { useId, useMemo, useState } from "react";
import { useT } from "@/lib/i18n/provider";
import { walkAwayPrice } from "@/lib/calc/walk-away";
import { BANK_LTV, BANK_MAX_TENURE, LTV_TENURE_THRESHOLD, ruleNeedsDisclaimer, SSD_FROM_2025_07_04, type BuyerProfile, type RuleKey } from "@/lib/calc/rules";
import { estimatePrice, formatIsoDay } from "@/lib/launch-insights";
import { formatMonth, formatPct, formatPsf, formatSgd } from "@/lib/format";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";

export interface WalkAwayToolProps {
  /** latest developer-reported median psf for the launch, used to prefill the price from a size */
  medianPsf: number | null;
  /** "YYYY-MM" of medianPsf */
  medianPsfMonth: string | null;
  /** default interest rate (% p.a.), e.g. 3M compounded SORA; null when no rates snapshot */
  defaultRatePct: number | null;
  /** where the default rate comes from, e.g. "3M compounded SORA, 30 Sep 2026" */
  defaultRateSource: string | null;
}

const MAX_LTV_PCT = Math.round(BANK_LTV[0].standard * 100);
/** MAS: a first housing loan with a tenure over the threshold (30 years for private property) gets the reduced LTV. */
const REDUCED_LTV_PCT = Math.round(BANK_LTV[0].reduced * 100);
const SSD_YEARS = SSD_FROM_2025_07_04.rates.length;
/** Rules behind the walk-away price (stamp duties from calc/walk-away.ts, the MAS LTV cap on the loan field). */
const WALK_AWAY_RULES: RuleKey[] = ["bsdResidential", "bsdRounding", "absdRates", "absdRounding", "ssd2025", "ssdRounding", "bankLtv"];
/** The method note adds an "indicative" caveat while any of them is not marked verified in rules.ts. */
const WALK_AWAY_INDICATIVE = WALK_AWAY_RULES.some(ruleNeedsDisclaimer);

const num = (s: string): number => (s.trim() === "" ? Number.NaN : Number(s));

/**
 * Walk-away (break-even) price calculator over calc/walk-away.ts: the resale price needed after the
 * holding period to recover the price, stamp duties, interest, selling costs and other costs.
 */
export function WalkAwayTool({ medianPsf, medianPsfMonth, defaultRatePct, defaultRateSource }: WalkAwayToolProps) {
  const t = useT();
  const id = useId();
  const [purchaseDate] = useState(() => new Date());
  const [size, setSize] = useState("");
  const [price, setPrice] = useState("");
  const [priceFromSize, setPriceFromSize] = useState(false);
  const [loanPct, setLoanPct] = useState(String(MAX_LTV_PCT));
  const [rate, setRate] = useState(defaultRatePct != null ? String(defaultRatePct) : "");
  const [tenure, setTenure] = useState(String(LTV_TENURE_THRESHOLD.private));
  const [holding, setHolding] = useState(String(SSD_YEARS + 1));
  const [profile, setProfile] = useState<BuyerProfile>("SC");
  const [count, setCount] = useState("1");
  const [agentPct, setAgentPct] = useState("2");
  const [other, setOther] = useState("0");

  function onSize(v: string) {
    setSize(v);
    const est = estimatePrice(medianPsf, num(v));
    if (est != null) {
      setPrice(String(est));
      setPriceFromSize(true);
    } else if (priceFromSize) {
      // the size behind the estimated price was cleared: drop the estimate rather than leave it unlabelled
      setPrice("");
      setPriceFromSize(false);
    }
  }

  const values = {
    size: num(size),
    price: num(price),
    loanPct: num(loanPct),
    rate: num(rate),
    tenure: num(tenure),
    holding: num(holding),
    agentPct: num(agentPct),
    other: num(other),
  };
  // Validation: an empty price just keeps the result panel in its prompt state; every other field is
  // prefilled, so emptying it (or entering an out-of-range value) shows an inline message.
  const raw = { size, price, loanPct, rate, tenure, holding, agentPct, other };
  const errors: Partial<Record<keyof typeof values, string>> = {};
  const required = t("launches.walk.err.required", "Required.");
  const check = (k: keyof typeof values, ok: boolean, message: string, optional = false) => {
    if (raw[k].trim() === "") {
      if (!optional) errors[k] = k === "price" ? "" : required;
    } else if (!ok) errors[k] = message;
  };
  check("price", values.price >= 10_000, t("launches.walk.err.price", "Enter a price of at least S$10,000."));
  const longTenure = values.tenure > LTV_TENURE_THRESHOLD.private;
  const maxLoanPct = longTenure ? REDUCED_LTV_PCT : MAX_LTV_PCT;
  check("loanPct", values.loanPct >= 0 && values.loanPct <= maxLoanPct, t("launches.walk.err.loan", "Between 0% and {max}%.", { max: maxLoanPct }));
  check("rate", values.rate >= 0 && values.rate <= 20, t("launches.walk.err.rate", "Between 0% and 20%."));
  check("tenure", values.tenure >= 1 && values.tenure <= BANK_MAX_TENURE.private, t("launches.walk.err.tenure", "Between 1 and {max} years.", { max: BANK_MAX_TENURE.private }));
  check("holding", values.holding >= 0.5 && values.holding <= 50, t("launches.walk.err.holding", "Between 0.5 and 50 years."));
  check("agentPct", values.agentPct >= 0 && values.agentPct <= 10, t("launches.walk.err.agent", "Between 0% and 10%."));
  check("other", values.other >= 0, t("launches.walk.err.other", "Enter 0 or more."));
  check("size", values.size > 0, t("launches.walk.err.size", "Enter a size in square feet."), true);
  const valid = Object.keys(errors).filter((k) => k !== "size").length === 0;
  const shown = (k: keyof typeof values) => (errors[k] ? errors[k] : null);

  const result = useMemo(() => {
    if (!valid) return null;
    return walkAwayPrice({
      price: values.price,
      loanAmount: (values.price * values.loanPct) / 100,
      interestRatePct: values.rate,
      tenureYears: values.tenure,
      holdingYears: values.holding,
      buyerProfile: profile,
      propertyCount: Number(count),
      agentFeePct: values.agentPct / 100,
      otherCosts: values.other,
      purchaseDate,
    });
  }, [valid, values.price, values.loanPct, values.rate, values.tenure, values.holding, values.agentPct, values.other, profile, count, purchaseDate]);

  const absdRate = result && values.price > 0 ? result.absd / values.price : 0;
  const breakEvenPsf = result && values.size > 0 ? result.breakEven / values.size : null;
  const fid = (k: string) => `${id}-${k}`;
  const err = (k: keyof typeof values) =>
    shown(k) ? (
      <p id={fid(`${k}-err`)} className="text-xs text-down">
        {shown(k)}
      </p>
    ) : null;
  const invalidProps = (k: keyof typeof values) => (shown(k) ? { "aria-invalid": true as const, "aria-describedby": fid(`${k}-err`) } : {});

  const rows: { label: string; value: number; note?: string }[] = result
    ? [
        { label: t("launches.walk.row.price", "Purchase price"), value: values.price },
        { label: t("launches.walk.row.bsd", "Buyer's stamp duty"), value: result.bsd },
        { label: t("launches.walk.row.absd", "Additional buyer's stamp duty"), value: result.absd, note: formatPct(absdRate, 0) },
        { label: t("launches.walk.row.interest", "Interest paid while holding"), value: result.interestPaid, note: t("launches.walk.estimate", "estimate") },
        { label: t("launches.walk.row.other", "Other costs"), value: result.otherCosts },
        { label: t("launches.walk.row.agent", "Agent's fee on sale"), value: result.agentFee, note: formatPct(values.agentPct / 100, 1) },
        { label: t("launches.walk.row.ssd", "Seller's stamp duty on sale"), value: result.ssd, note: formatPct(result.ssdRate, 0) },
      ]
    : [];
  // A sale on (or within a day of) a purchase anniversary sits between two SSD bands; say so instead of picking one silently.
  const ssdAmbiguity =
    result && result.ssdNearAnniversary && result.ssdAlternative && result.saleDate
      ? t(
          "launches.walk.ssdAnniversary",
          "The assumed sale date, {date}, falls on an anniversary of the purchase, so the seller's stamp duty band is ambiguous: this uses {rate}, the other reading gives {alt}. Check with IRAS, or change the holding period.",
          { date: formatIsoDay(result.saleDate), rate: formatPct(result.ssdRate, 0), alt: formatPct(result.ssdAlternative.rate, 0) },
        )
      : null;
  const gainText =
    result != null
      ? values.holding === 1
        ? t("launches.walk.gainOne", "{pct} above your purchase price after 1 year", { pct: formatPct(result.requiredGainPct, 1) })
        : t("launches.walk.gain", "{pct} above your purchase price after {years} years", { pct: formatPct(result.requiredGainPct, 1), years: values.holding })
      : "";

  return (
    <Card>
      <CardBody className="grid gap-6 lg:grid-cols-2">
        <form className="grid grid-cols-1 content-start gap-x-3 gap-y-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()} aria-label={t("launches.walk.formLabel", "Walk-away price inputs")}>
          <Field
            label={t("launches.walk.size", "Unit size (sqft)")}
            htmlFor={fid("size")}
            hint={
              medianPsf != null
                ? t("launches.walk.sizeHint", "Optional: fills the price from the median {psf} ({month}).", { psf: formatPsf(medianPsf), month: formatMonth(medianPsfMonth) })
                : t("launches.walk.sizeHintNoPsf", "No developer price data yet, so enter the price directly.")
            }
          >
            <Input id={fid("size")} type="number" inputMode="numeric" min={1} step={1} value={size} onChange={(e) => onSize(e.target.value)} disabled={medianPsf == null} {...invalidProps("size")} />
            {err("size")}
          </Field>
          <Field
            label={t("launches.walk.price", "Purchase price (S$)")}
            htmlFor={fid("price")}
            hint={
              priceFromSize && medianPsf != null && values.size > 0 ? (
                <span className="inline-flex flex-wrap items-center gap-1">
                  <Badge tone="warn">{t("launches.walk.estimateBadge", "Estimate")}</Badge>
                  {t("launches.walk.priceEstimate", "{psf} × {size} sqft", { psf: formatPsf(medianPsf), size: values.size })}
                </span>
              ) : undefined
            }
          >
            <Input
              id={fid("price")}
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setPriceFromSize(false);
              }}
              {...invalidProps("price")}
            />
            {err("price")}
          </Field>
          <Field
            label={t("launches.walk.loan", "Loan (% of price)")}
            htmlFor={fid("loan")}
            hint={
              longTenure
                ? t("launches.walk.loanHintLong", "MAS limit: {max}% for a first housing loan with a tenure over {years} years.", { max: REDUCED_LTV_PCT, years: LTV_TENURE_THRESHOLD.private })
                : t("launches.walk.loanHint", "MAS limit: {max}% for a first housing loan.", { max: MAX_LTV_PCT })
            }
          >
            <Input id={fid("loan")} type="number" inputMode="decimal" min={0} max={maxLoanPct} step={5} value={loanPct} onChange={(e) => setLoanPct(e.target.value)} {...invalidProps("loanPct")} />
            {err("loanPct")}
          </Field>
          <Field
            label={t("launches.walk.rate", "Interest rate (% a year)")}
            htmlFor={fid("rate")}
            hint={defaultRateSource ? t("launches.walk.rateHint", "Prefilled: {source}. Banks add a spread.", { source: defaultRateSource }) : undefined}
          >
            <Input id={fid("rate")} type="number" inputMode="decimal" min={0} max={20} step={0.05} value={rate} onChange={(e) => setRate(e.target.value)} {...invalidProps("rate")} />
            {err("rate")}
          </Field>
          <Field label={t("launches.walk.tenure", "Loan tenure (years)")} htmlFor={fid("tenure")}>
            <Input id={fid("tenure")} type="number" inputMode="numeric" min={1} max={BANK_MAX_TENURE.private} step={1} value={tenure} onChange={(e) => setTenure(e.target.value)} {...invalidProps("tenure")} />
            {err("tenure")}
          </Field>
          <Field label={t("launches.walk.holding", "Holding period (years)")} htmlFor={fid("holding")} hint={t("launches.walk.holdingHint", "Selling within {n} years of purchase incurs seller's stamp duty.", { n: SSD_YEARS })}>
            <Input id={fid("holding")} type="number" inputMode="decimal" min={0.5} max={50} step={0.5} value={holding} onChange={(e) => setHolding(e.target.value)} {...invalidProps("holding")} />
            {err("holding")}
          </Field>
          <Field label={t("launches.walk.profile", "Buyer profile")} htmlFor={fid("profile")}>
            <Select id={fid("profile")} value={profile} onChange={(e) => setProfile(e.target.value as BuyerProfile)}>
              <option value="SC">{t("launches.walk.profile.SC", "Singapore citizen")}</option>
              <option value="SPR">{t("launches.walk.profile.SPR", "Permanent resident")}</option>
              <option value="FOREIGNER">{t("launches.walk.profile.FOREIGNER", "Foreigner")}</option>
              <option value="ENTITY">{t("launches.walk.profile.ENTITY", "Entity or trust")}</option>
            </Select>
          </Field>
          <Field label={t("launches.walk.count", "This purchase is your")} htmlFor={fid("count")}>
            <Select id={fid("count")} value={count} onChange={(e) => setCount(e.target.value)}>
              <option value="1">{t("launches.walk.count.1", "1st residential property")}</option>
              <option value="2">{t("launches.walk.count.2", "2nd residential property")}</option>
              <option value="3">{t("launches.walk.count.3", "3rd or later property")}</option>
            </Select>
          </Field>
          <Field label={t("launches.walk.agent", "Agent's fee on sale (%)")} htmlFor={fid("agent")} hint={t("launches.walk.agentHint", "Set 0 if you sell without an agent.")}>
            <Input id={fid("agent")} type="number" inputMode="decimal" min={0} max={10} step={0.1} value={agentPct} onChange={(e) => setAgentPct(e.target.value)} {...invalidProps("agentPct")} />
            {err("agentPct")}
          </Field>
          <Field label={t("launches.walk.other", "Other costs (S$)")} htmlFor={fid("other")} hint={t("launches.walk.otherHint", "Legal fees, renovation, furnishing.")}>
            <Input id={fid("other")} type="number" inputMode="numeric" min={0} step={1000} value={other} onChange={(e) => setOther(e.target.value)} {...invalidProps("other")} />
            {err("other")}
          </Field>
        </form>

        <div aria-live="polite" className="min-w-0">
          {result ? (
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">{t("launches.walk.breakEven", "Walk-away price")}</span>
                <Badge tone="warn">{t("launches.walk.estimateBadge", "Estimate")}</Badge>
              </div>
              <div className="tabular mt-1 text-3xl font-bold text-ink">{formatSgd(result.breakEven)}</div>
              <p className="mt-1 text-sm text-muted">
                {gainText}
                {breakEvenPsf != null ? ` · ${formatPsf(breakEvenPsf)}` : ""}
              </p>
              <table className="tabular mt-4 w-full text-sm">
                <caption className="sr-only">{t("launches.walk.tableCaption", "Costs that make up the walk-away price")}</caption>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label} className="border-b border-line/70">
                      <th scope="row" className="py-2 pr-2 text-left font-normal text-muted">
                        {r.label}
                        {r.note ? <span className="ml-1 text-xs">({r.note})</span> : null}
                      </th>
                      <td className="py-2 text-right text-ink">{formatSgd(r.value)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="pt-2 text-left font-semibold text-ink">
                      {t("launches.walk.row.total", "Break-even sale price")}
                    </th>
                    <td className="pt-2 text-right font-semibold text-ink">{formatSgd(result.breakEven)}</td>
                  </tr>
                </tbody>
              </table>
              {ssdAmbiguity ? (
                <Notice tone="warn" className="mt-3 text-xs leading-5">
                  {ssdAmbiguity}
                </Notice>
              ) : null}
            </div>
          ) : (
            <div className="flex h-full min-h-32 items-center justify-center rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
              {price.trim() === ""
                ? t("launches.walk.empty", "Enter a purchase price (or a unit size) to see the price you would need to sell at to break even.")
                : t("launches.walk.fix", "Check the highlighted fields to see your walk-away price.")}
            </div>
          )}
          <p className="mt-4 text-xs leading-5 text-muted">
            {t(
              "launches.walk.method",
              "Estimate. Stamp duties use IRAS rates; interest assumes the whole loan is drawn on purchase and repaid monthly, so it overstates interest during construction under progressive payments. Excludes property tax, maintenance fees and any rental income. Rounded up to the nearest S$1,000.",
            )}
            {WALK_AWAY_INDICATIVE ? (
              <>
                {" "}
                {t("launches.walk.indicative", "Indicative: some stamp-duty and loan rules used here are not yet verified against the agencies' own pages, so check with IRAS / MAS before you commit.")}
              </>
            ) : null}
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
