/**
 * Post-ingest sanity checks on the written snapshot (fails the workflow before anything is committed).
 *   tsx scripts/ingest/validate.ts data
 */
import fs from "node:fs";
import path from "node:path";
import type { DatasetMeta, HdbBlock } from "../../src/lib/data/types";

const dir = path.resolve(process.argv[2] ?? "data");
const fail = (msg: string) => {
  console.error(`VALIDATION FAILED: ${msg}`);
  process.exit(1);
};
const read = <T,>(rel: string): T => JSON.parse(fs.readFileSync(path.join(dir, rel), "utf8")) as T;

const meta = read<DatasetMeta>("meta.json");
if (meta.fixture) fail("snapshot is flagged as fixture data");
if (meta.counts.hdbTransactions < 900_000) fail(`only ${meta.counts.hdbTransactions} HDB transactions`);
if (meta.counts.hdbBlocks < 9_000) fail(`only ${meta.counts.hdbBlocks} HDB blocks`);
if (!meta.latestMonth.hdb || meta.latestMonth.hdb < "2026-01") fail(`latest HDB month ${meta.latestMonth.hdb}`);
const blocks = read<HdbBlock[]>("hdb/blocks.json");
const slugs = new Set<string>();
for (const b of blocks) {
  if (slugs.has(b.slug)) fail(`duplicate block slug ${b.slug}`);
  slugs.add(b.slug);
  if (b.lat != null && (b.lat < 1.15 || b.lat > 1.48)) fail(`block ${b.slug} latitude ${b.lat}`);
}
const projects = read<{ slug: string }[]>("private/projects.json");
const pslugs = new Set<string>();
for (const p of projects) {
  if (pslugs.has(p.slug)) fail(`duplicate project slug ${p.slug}`);
  pslugs.add(p.slug);
}
let bytes = 0;
const walk = (d: string) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else {
      const size = fs.statSync(p).size;
      if (size > 90 * 1024 * 1024) fail(`${p} is ${Math.round(size / 1e6)} MB (GitHub limit 100 MB)`);
      bytes += size;
    }
  }
};
walk(dir);
console.log(`snapshot OK: ${JSON.stringify(meta.counts)}; ${Math.round(bytes / 1e6)} MB; geocoded blocks ${blocks.filter((b) => b.lat != null).length}/${blocks.length}`);
for (const s of meta.sources) console.log(`  ${s.id}: ${s.status} rows=${s.rows} latest=${s.latestPeriod ?? "-"} ${s.note ?? ""}`);
