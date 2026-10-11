"use client";

import { useId } from "react";
import { useT } from "@/lib/i18n/provider";
import { Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { districtLabel, type ListingType } from "@/lib/launch-insights";
import type { MarketSegment } from "@/lib/data/types";

/** Plain GET form for the /listings/ district filter (works without JavaScript). */
export function DistrictFilter({
  type,
  segment,
  district,
  options,
}: {
  type: ListingType;
  segment: MarketSegment | null;
  district: number | null;
  options: { district: number; count: number }[];
}) {
  const t = useT();
  const id = useId();
  const known = district == null || options.some((o) => o.district === district);
  return (
    <form method="get" action="/listings/" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="type" value={type} />
      {segment ? <input type="hidden" name="segment" value={segment} /> : null}
      <div className="min-w-0">
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">
          {t("launches.filter.district", "Postal district")}
        </label>
        <Select id={id} name="district" defaultValue={district != null ? String(district) : ""} className="w-56 max-w-full">
          <option value="">{t("launches.filter.allDistricts", "All districts")}</option>
          {!known && district != null ? <option value={String(district)}>{t("launches.filter.districtOption", "{d} ({n})", { d: districtLabel(district) ?? "", n: 0 })}</option> : null}
          {options.map((o) => (
            <option key={o.district} value={String(o.district)}>
              {t("launches.filter.districtOption", "{d} ({n})", { d: districtLabel(o.district) ?? "", n: o.count })}
            </option>
          ))}
        </Select>
      </div>
      <button type="submit" className={buttonClass("outline", "md")}>
        {t("launches.filter.apply", "Apply")}
      </button>
    </form>
  );
}
