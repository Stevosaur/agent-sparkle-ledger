import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { account } from "@/lib/i18n/messages/account";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts") ? [p] : [];
  });
}

describe("account i18n namespace", () => {
  it("has a Chinese string with the same placeholders for every English key", () => {
    for (const [key, en] of Object.entries(account.en)) {
      expect(key.startsWith("account."), key).toBe(true);
      expect(account.zh[key], key).toBeTruthy();
      expect(placeholders(account.zh[key]), key).toEqual(placeholders(en));
    }
    expect(Object.keys(account.zh).sort()).toEqual(Object.keys(account.en).sort());
  });

  it("defines every account.* key referenced by the account UI", () => {
    const root = path.resolve(__dirname, "../..");
    const dirs = ["components/account", "app/login", "app/profile", "app/my-property", "app/plus", "lib/account"].map((d) => path.join(root, d));
    const used = new Set<string>();
    for (const file of dirs.flatMap(sourceFiles)) {
      for (const m of fs.readFileSync(file, "utf8").matchAll(/"(account\.[A-Za-z0-9_.]+)"/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(100);
    for (const key of used) expect(account.en[key], key).toBeTruthy();
  });
});
