import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { home } from "@/lib/i18n/messages/home";

const ROOT = path.resolve(__dirname, "../../..");
const FILES = ["src/app/page.tsx", "src/app/property-analysis", "src/components/home"];

function sourceFiles(rel: string): string[] {
  const abs = path.join(ROOT, rel);
  if (fs.statSync(abs).isFile()) return [abs];
  return fs
    .readdirSync(abs, { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"))
    .map((f) => path.join(abs, f));
}

describe("home i18n namespace", () => {
  it("has the same keys in en and zh, all prefixed home.", () => {
    const en = Object.keys(home.en).sort();
    expect(Object.keys(home.zh).sort()).toEqual(en);
    expect(en.every((k) => k.startsWith("home."))).toBe(true);
    expect(Object.values(home.zh).every((v) => v.trim().length > 0)).toBe(true);
  });

  it("keeps the same {placeholders} in both languages", () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(home.en)) expect(vars(home.zh[key]), key).toEqual(vars(home.en[key]));
  });

  it("defines every home.* key used by the home and property-analysis pages", () => {
    const used = new Set<string>();
    for (const file of FILES.flatMap(sourceFiles)) {
      for (const m of fs.readFileSync(file, "utf8").matchAll(/["'](home\.[A-Za-z.]+)["']/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(50);
    const missing = [...used].filter((k) => !(k in home.en));
    expect(missing).toEqual([]);
  });
});
