import { it } from "vitest";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tools } from "@/lib/i18n/messages/tools";
import { common } from "@/lib/i18n/messages/common";

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}
it("i18n", () => {
  const out: string[] = [];
  const en = tools.en as Record<string, string>;
  const zh = tools.zh as Record<string, string>;
  for (const k of Object.keys(en)) if (!(k in zh)) out.push(`missing zh: ${k}`);
  for (const k of Object.keys(zh)) if (!(k in en)) out.push(`extra zh: ${k}`);
  const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  for (const k of Object.keys(en)) if (k in zh && ph(en[k]) !== ph(zh[k])) out.push(`placeholder mismatch ${k}: ${ph(en[k])} vs ${ph(zh[k])}`);
  const roots = ["src/app/valuation", "src/app/affordability", "src/app/mortgage-rates", "src/app/compare", "src/app/compare-units", "src/app/supply-demand", "src/components/tools"];
  const used = new Map<string, string>();
  for (const r of roots) for (const f of walk(r)) {
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(/(?:\bt\(|k=)\s*"([a-zA-Z0-9_.]+)"(?:,\s*"((?:[^"\\]|\\.)*)")?/g)) used.set(m[1], m[2] ?? "");
    for (const m of s.matchAll(/k="([a-zA-Z0-9_.]+)"\s+fallback="([^"]*)"/g)) used.set(m[1], m[2]);
  }
  const ce = common.en as Record<string, string>;
  for (const [k, fb] of used) {
    if (k.startsWith("tools.")) {
      if (!(k in en)) out.push(`used but missing: ${k}`);
      else if (fb && en[k] !== fb.replace(/\\"/g, '"')) out.push(`fallback differs: ${k}\n   code: ${fb}\n   msgs: ${en[k]}`);
    } else if (!(k in ce)) out.push(`non-tools key not in common: ${k}`);
  }
  const usedKeys = new Set(used.keys());
  for (const k of Object.keys(en)) if (!usedKeys.has(k)) out.push(`unused: ${k}`);
  writeFileSync("/tmp/claude-0/-home-user-agent-sparkle-ledger/e2b61974-e262-5bdd-81c1-f936fd8c7bdb/scratchpad/i18n.txt", out.join("\n"));
});
