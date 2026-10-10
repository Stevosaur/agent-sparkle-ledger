"use client";

import { useId } from "react";
import { useT } from "@/lib/i18n/provider";
import { HDB_FLAT_TYPES } from "@/lib/data/types";
import type { PropertyKind } from "@/lib/property-ref";
import { currentMonthSg, MIN_PURCHASE_MONTH } from "@/lib/account/validation";
import { Field, Input, Select } from "@/components/ui/form";

/** Editable details of a tracked home, as form strings. */
export interface HomeDetailsDraft {
  flatType: string;
  areaSqm: string;
  floor: string;
  purchasePrice: string;
  purchaseMonth: string;
}

export const EMPTY_DRAFT: HomeDetailsDraft = { flatType: "", areaSqm: "", floor: "", purchasePrice: "", purchaseMonth: "" };

export function draftFrom(v: { flatType: string | null; areaSqm: number | null; floor: number | null; purchasePrice: number | null; purchaseMonth: string | null }): HomeDetailsDraft {
  return {
    flatType: v.flatType ?? "",
    areaSqm: v.areaSqm != null ? String(v.areaSqm) : "",
    floor: v.floor != null ? String(v.floor) : "",
    purchasePrice: v.purchasePrice != null ? String(v.purchasePrice) : "",
    purchaseMonth: v.purchaseMonth ?? "",
  };
}

/** Request body fields for POST / PATCH /api/tracked/ (validated again on the server). */
export function draftToBody(d: HomeDetailsDraft): Record<string, string | null> {
  return {
    flatType: d.flatType || null,
    areaSqm: d.areaSqm.trim() || null,
    floor: d.floor.trim() || null,
    purchasePrice: d.purchasePrice.trim() || null,
    purchaseMonth: d.purchaseMonth.trim() || null,
  };
}

/** Localised message for an /api/tracked/ validation or limit error code. */
export function useTrackedErrorText(): (code: string, vars?: Record<string, string | number>) => string {
  const t = useT();
  return (code, vars) => {
    switch (code) {
      case "flat_type_required":
        return t("account.tracked.err.flatType", "Choose the flat type.");
      case "area_required":
        return t("account.tracked.err.areaRequired", "Enter the floor area in square metres.");
      case "invalid_area":
        return t("account.tracked.err.area", "Floor area must be between 10 and 10,000 sqm.");
      case "invalid_floor":
        return t("account.tracked.err.floor", "Floor must be a whole number between 1 and 150.");
      case "invalid_price":
        return t("account.tracked.err.price", "Purchase price must be between S$1,000 and S$1,000,000,000.");
      case "invalid_month":
        return t("account.tracked.err.month", "Purchase month must be a past month (YYYY-MM).");
      case "unsupported_property":
      case "invalid_ref":
        return t("account.tracked.err.kind", "Pick an HDB block, condo or landed address from the search results.");
      case "not_found":
        return t("account.tracked.err.notFound", "We couldn't find that property.");
      case "plus_required":
        return t("account.tracked.err.plus", "Free accounts can track {free} home. Upgrade to {plus} to track more.", vars);
      case "limit_reached":
        return t("account.tracked.err.limit", "You've reached the limit of {max} tracked homes.", vars);
      case "sign_in_required":
        return t("account.tracked.err.signIn", "Your session has expired. Please sign in again.");
      default:
        return t("common.error", "Something went wrong. Please try again.");
    }
  };
}

/** Flat type / area / floor / purchase price and month inputs, adapted to the property kind. */
export function HomeDetailsFields({ kind, value, onChange, disabled }: { kind: PropertyKind; value: HomeDetailsDraft; onChange: (next: HomeDetailsDraft) => void; disabled?: boolean }) {
  const t = useT();
  const id = useId();
  const set = (patch: Partial<HomeDetailsDraft>) => onChange({ ...value, ...patch });
  const maxMonth = currentMonthSg();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {kind === "hdb" ? (
        <Field htmlFor={`${id}-type`} label={t("account.tracked.flatType", "Flat type")}>
          <Select id={`${id}-type`} required value={value.flatType} onChange={(e) => set({ flatType: e.target.value })} disabled={disabled}>
            <option value="">{t("account.tracked.chooseType", "Choose…")}</option>
            {HDB_FLAT_TYPES.map((ft) => (
              <option key={ft} value={ft}>
                {ft}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field
        htmlFor={`${id}-area`}
        label={kind === "landed" ? t("account.tracked.landArea", "Land area (sqm)") : t("account.tracked.area", "Floor area (sqm)")}
        hint={
          kind === "condo"
            ? t("account.tracked.areaHintCondo", "Required. From your title deed or sales brochure. 1 sqm = 10.76 sqft.")
            : kind === "landed"
              ? t("account.tracked.areaHintLanded", "Optional. Leave blank to use the land area from the latest recorded sale.")
              : t("account.tracked.areaHintHdb", "Optional, for your reference. 1 sqm = 10.76 sqft.")
        }
      >
        <Input
          id={`${id}-area`}
          type="number"
          inputMode="decimal"
          min={10}
          max={10000}
          step="any"
          required={kind === "condo"}
          value={value.areaSqm}
          onChange={(e) => set({ areaSqm: e.target.value })}
          disabled={disabled}
        />
      </Field>
      {kind !== "landed" ? (
        <Field htmlFor={`${id}-floor`} label={t("account.tracked.floor", "Floor")} hint={t("account.tracked.optional", "Optional")}>
          <Input id={`${id}-floor`} type="number" inputMode="numeric" min={1} max={150} step={1} value={value.floor} onChange={(e) => set({ floor: e.target.value })} disabled={disabled} />
        </Field>
      ) : null}
      <Field htmlFor={`${id}-price`} label={t("account.tracked.price", "Purchase price (S$)")} hint={t("account.tracked.priceHint", "Optional. Used to show your estimated gain.")}>
        <Input id={`${id}-price`} type="text" inputMode="numeric" autoComplete="off" value={value.purchasePrice} onChange={(e) => set({ purchasePrice: e.target.value })} disabled={disabled} />
      </Field>
      <Field htmlFor={`${id}-month`} label={t("account.tracked.month", "Purchase month")} hint={t("account.tracked.optional", "Optional")}>
        <Input id={`${id}-month`} type="month" min={MIN_PURCHASE_MONTH} max={maxMonth} placeholder="YYYY-MM" value={value.purchaseMonth} onChange={(e) => set({ purchaseMonth: e.target.value })} disabled={disabled} />
      </Field>
    </div>
  );
}
