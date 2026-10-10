import { estimateHome } from "@/lib/account/estimate";
import type { TrackedHomeView } from "@/lib/account/types";
import { PageContainer } from "@/components/ui/section";
import { ReviewClient } from "./client";

export const dynamic = "force-dynamic";

/** TEMPORARY review scratch page (accounts reviewer). Deleted after the 360px check. */
export default function Page() {
  const base = { label: "Blk 872A Tampines St 86", href: "/hdb/blk-872a-tampines-st-86/", kind: "hdb" as const, ref: "hdb:blk-872a-tampines-st-86", floor: 12, createdAt: "2026-01-01T00:00:00Z" };
  const homes: TrackedHomeView[] = [
    { ...base, id: 1, flatType: "4 ROOM", areaSqm: 92, purchasePrice: 420000, purchaseMonth: "2019-05", estimate: estimateHome({ ref: { kind: "hdb", slug: "blk-872a-tampines-st-86" }, flatType: "4 ROOM", areaSqm: 92, purchasePrice: 420000, purchaseMonth: "2019-05" }) },
    { ...base, id: 2, label: "Sample Park Condo With A Rather Long Development Name", href: "/condo/sample-park-condo/", kind: "condo", ref: "condo:sample-park-condo", flatType: null, areaSqm: 85, floor: null, purchasePrice: 1250000, purchaseMonth: "2022-03", estimate: estimateHome({ ref: { kind: "condo", slug: "sample-park-condo" }, flatType: null, areaSqm: 85, purchasePrice: 1250000, purchaseMonth: "2022-03" }) },
    { ...base, id: 3, flatType: "5 ROOM", areaSqm: null, purchasePrice: null, purchaseMonth: null, estimate: { status: "unavailable", reason: "over-limit" } },
  ];
  return (
    <PageContainer className="pb-16">
      <h1 className="text-2xl font-bold">Review</h1>
      <ReviewClient homes={homes} />
    </PageContainer>
  );
}
