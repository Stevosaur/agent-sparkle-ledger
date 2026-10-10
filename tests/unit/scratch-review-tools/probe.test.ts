import { it } from "vitest";
import { resolveValuationDeepLink } from "@/lib/tools/valuation-subject";
import { search } from "@/lib/data/search";

import { writeFileSync } from "node:fs";
const out: unknown[] = [];
it("probe", () => {
  const cases: Record<string, string | undefined>[] = [
    { type: "hdb", block: "872A", street: "TAMPINES ST 86" },
    { type: "hdb", block: "999Z", street: "TAMPINES ST 86" },
    { type: "hdb", block: "872", street: "TAMPINES ST 86" },
    { type: "hdb", block: "1", street: "NOWHERE RD" },
    { type: "condo", project: "SAMPLE PARK CONDO" },
    { type: "condo", project: "SAMPLE" },
    { type: "condo", project: "THE HILLFORD" },
    { type: "condo", project: "FIXTURE" },
    { type: "hdb", postal: "999999" },
    { type: "landed", address: "15 SAMPLE LANE" },
    { type: "landed", address: "99 SAMPLE LANE" },
    { type: "landed", street: "SAMPLE LANE" },
    { type: "landed", street: "SAMPLE" },
    { ref: "launch:upcoming-fixture-towers" },
  ];
  for (const c of cases) {
    const r = resolveValuationDeepLink(c);
    out.push(`${JSON.stringify(c)} => ${r.type} ${r.subject?.ref ?? null} unresolved: ${r.unresolved}`);
  }
  out.push(search("999Z TAMPINES ST 86", { limit: 5, kinds: ["hdb"] }).map((h) => h.label));
  writeFileSync("/tmp/claude-0/-home-user-agent-sparkle-ledger/e2b61974-e262-5bdd-81c1-f936fd8c7bdb/scratchpad/probe.txt", out.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n"));
});
