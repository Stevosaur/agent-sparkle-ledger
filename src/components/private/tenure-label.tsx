import { T } from "@/components/i18n/t";
import type { TenureSummary } from "@/lib/private-insights";

/** "Freehold" / "99-year lease from 2012 · ~85 years left" with i18n. */
export function TenureLabel({ tenure }: { tenure: TenureSummary | null }) {
  if (!tenure) return <T k="private.tenure.unknown" fallback="Tenure not recorded" />;
  if (tenure.kind === "freehold") return <T k="private.tenure.freehold" fallback="Freehold" />;
  return (
    <>
      {tenure.years != null && tenure.startYear != null ? (
        <T k="private.tenure.leaseFrom" fallback="{years}-year lease from {start}" vars={{ years: tenure.years, start: tenure.startYear }} />
      ) : tenure.years != null ? (
        <T k="private.tenure.lease" fallback="{years}-year lease" vars={{ years: tenure.years }} />
      ) : (
        <T k="private.tenure.leasehold" fallback="Leasehold" />
      )}
      {tenure.yearsLeft != null ? (
        <>
          {" · "}
          <T k="private.tenure.left" fallback="~{n} years left" vars={{ n: tenure.yearsLeft }} />
        </>
      ) : null}
    </>
  );
}
