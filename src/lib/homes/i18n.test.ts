import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { homes } from "@/lib/i18n/messages/homes";

/** Every "homes.*" key used by the homes / services / leads UI exists in English and Chinese. */

const ROOTS = ["src/app/homes", "src/app/services", "src/components/homes", "src/components/leads", "src/lib/homes"];

function sourceFiles(dir: string): string[] {
  const abs = path.resolve(process.cwd(), dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [p] : [];
  });
}

const used = new Set<string>();
for (const file of ROOTS.flatMap(sourceFiles)) {
  const src = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
  for (const m of src.matchAll(/["'`](homes\.[A-Za-z0-9_.]+)["'`]/g)) used.add(m[1]);
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("homes i18n namespace", () => {
  it("finds the keys used in the UI", () => {
    expect(used.size).toBeGreaterThan(100);
  });
  it("defines every used key in en and zh", () => {
    const missingEn = [...used].filter((k) => !(k in homes.en));
    const missingZh = [...used].filter((k) => !(k in homes.zh));
    expect(missingEn).toEqual([]);
    expect(missingZh).toEqual([]);
  });
  it("has the same keys and placeholders in both languages", () => {
    expect(Object.keys(homes.zh).sort()).toEqual(Object.keys(homes.en).sort());
    for (const [k, v] of Object.entries(homes.en)) expect(placeholders(homes.zh[k]), k).toEqual(placeholders(v));
  });
  it("only defines keys in its own namespace", () => {
    expect(Object.keys(homes.en).every((k) => k.startsWith("homes."))).toBe(true);
  });
});
