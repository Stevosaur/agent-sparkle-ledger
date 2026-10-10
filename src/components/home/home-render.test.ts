/**
 * Server-render the home and property-analysis pages against the fixture snapshot and against an
 * empty snapshot (no data ingested yet) to check sections and honest empty states.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, prefetch: () => undefined }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// next.config sets trailingSlash: true, which Next exposes to <Link> through this build-time env var
process.env.__NEXT_TRAILING_SLASH = "true";

const FIXTURES = process.env.DATA_DIR!;
const EMPTY = fs.mkdtempSync(path.join(os.tmpdir(), "plotline-empty-"));

afterAll(() => {
  process.env.DATA_DIR = FIXTURES;
  delete process.env.__NEXT_TRAILING_SLASH;
  fs.rmSync(EMPTY, { recursive: true, force: true });
});

async function loadPages(dataDir: string) {
  process.env.DATA_DIR = dataDir;
  vi.resetModules(); // loaders keep module-level indexes; start clean for each snapshot
  const home = await import("@/app/page");
  const analysis = await import("@/app/property-analysis/page");
  return { HomePage: home.default, PropertyAnalysisPage: analysis.default };
}

const html = (el: ReactElement) => renderToStaticMarkup(el);
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe("home page", () => {
  beforeEach(() => {
    process.env.DATA_DIR = FIXTURES;
  });

  it("renders every section from the fixture snapshot", async () => {
    const { HomePage } = await loadPages(FIXTURES);
    const out = html(createElement(HomePage));
    expect(count(out, /<h1\b/g)).toBe(1);
    expect(out).toContain("HDB resale records since 2015");
    expect(out).toContain("What is my home worth?");
    expect(out).toContain('href="/valuation/"');
    expect(out).toContain('href="/property-analysis/"');
    expect(out).toContain('href="/affordability/"');
    // eight tool tiles
    for (const href of ["/valuation/", "/property-analysis/", "/affordability/", "/mortgage-rates/", "/lists/", "/compare/", "/map/", "/insights/"]) expect(out).toContain(`href="${href}"`);
    // launch carousel
    expect(out).toContain('href="/new-launch/condo/aurora-fixture-residences/"');
    expect(out).toContain('href="/new-launch/condo/upcoming-fixture-towers/"');
    expect(out).toContain('role="progressbar"');
    // rates, market pulse, towns
    expect(out).toContain("3M compounded SORA");
    expect(out).toContain("1.70%");
    expect(out).toContain("Market pulse");
    expect(out).toContain("Sales in Aug 2026");
    expect(out).toContain('href="/insights/town/tampines/"');
    // JSON-LD search action
    expect(out).toContain('"@type":"SearchAction"');
    expect(out).toContain("/property-analysis/?q={search_term_string}");
  });

  it("shows honest empty states when nothing has been ingested", async () => {
    const { HomePage } = await loadPages(EMPTY);
    const out = html(createElement(HomePage));
    expect(count(out, /<h1\b/g)).toBe(1);
    expect(out).toContain("No transaction data loaded yet");
    expect(out).toContain("data.gov.sg");
    expect(out).toContain("No new-launch sales data has been loaded yet.");
    expect(out).toContain('href="/listings/"');
    expect(out).not.toContain("3M compounded SORA");
    expect(out).not.toContain("Popular HDB towns");
    expect(out).not.toContain("records since"); // no credibility counts without data
    expect(out).not.toContain("data to ");
  });
});

describe("property analysis page", () => {
  it("groups search results and lists recently transacted properties", async () => {
    const { PropertyAnalysisPage } = await loadPages(FIXTURES);
    const out = html(await PropertyAnalysisPage({ searchParams: Promise.resolve({ q: "tampines" }) }));
    expect(count(out, /<h1\b/g)).toBe(1);
    expect(out).toContain("HDB towns");
    expect(out).toContain('href="/insights/town/tampines/"');
    expect(out).toContain('href="/hdb/blk-872a-tampines-st-86/"');
    expect(out).toContain("What every property page shows");
    expect(out).toContain("Recently transacted");
    expect(out).toContain('href="/condo/the-fixture-ec/"');
    expect(out).toContain('name="q" value="tampines"');
  });

  it("explains a search with no matches and works without a query", async () => {
    const { PropertyAnalysisPage } = await loadPages(FIXTURES);
    const none = html(await PropertyAnalysisPage({ searchParams: Promise.resolve({ q: "zzqx" }) }));
    expect(none).toContain("No matches for");
    const blank = html(await PropertyAnalysisPage({ searchParams: Promise.resolve({}) }));
    expect(blank).not.toContain("Results for");
    expect(blank).toContain("Recently transacted");
    expect(blank).toContain('href="/hdb/blk-872a-tampines-st-86/"');
    expect(blank).not.toContain("/hdb/blk-999-tampines-st-99/"); // never sold, so not "recently transacted"
  });

  it("names the missing sources when nothing has been ingested", async () => {
    const { PropertyAnalysisPage } = await loadPages(EMPTY);
    const out = html(await PropertyAnalysisPage({ searchParams: Promise.resolve({ q: "tampines" }) }));
    expect(out).toContain("No matches for");
    expect(out).toContain("HDB resale records from data.gov.sg have not been loaded yet.");
    expect(out).toContain("URA Data Service access key");
  });
});
