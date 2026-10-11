import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Post-deploy smoke test against a live deployment (E2E_LIVE=1 E2E_BASE_URL=https://…). The deployment serves the
 * real snapshot, so property pages are discovered through the search API instead of the fixture slugs that
 * smoke.spec.ts uses. Run by .github/workflows/live-smoke.yml after every production deployment.
 */

const STATIC_ROUTES = [
  "/",
  "/property-analysis/?q=tampines",
  "/valuation/",
  "/affordability/",
  "/mortgage-rates/",
  "/compare/",
  "/compare-units/",
  "/listings/",
  "/listings/?type=upcoming",
  "/homes/",
  "/homes/fit/",
  "/services/",
  "/lists/",
  "/insights/",
  "/trendmaker/",
  "/news/",
  "/map/",
  "/my-property/",
  "/profile/",
  "/plus/",
  "/login/",
  "/docs/",
  "/spot/",
  "/methodology/",
  "/research/",
  "/about/",
  "/privacy/",
  "/tos/",
];

const IGNORED_CONSOLE = [/Failed to load resource/i, /net::ERR_/i, /onemap\.gov\.sg/i, /openstreetmap/i, /Download the React DevTools/i];

const origin = () => new URL(process.env.E2E_BASE_URL ?? "http://localhost").origin;

async function checkPage(page: Page, route: string, soft = false) {
  const check = soft ? expect.soft : expect;
  const errors: string[] = [];
  const onError = (e: Error) => errors.push(`pageerror: ${e.message}`);
  const onConsole = (m: { type(): string; text(): string }) => {
    if (m.type() === "error" && !IGNORED_CONSOLE.some((r) => r.test(m.text()))) errors.push(`console: ${m.text()}`);
  };
  page.on("pageerror", onError);
  page.on("console", onConsole);
  try {
    const res = await page.goto(route, { waitUntil: "domcontentloaded" });
    check(res?.status(), `${route} status`).toBe(200);
    await page.waitForLoadState("load");
    check(await page.locator("h1").count(), `${route} h1 count`).toBe(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow, `${route} horizontal overflow (px)`).toBeLessThanOrEqual(1);
    // the synthetic-data banner must never reach a real deployment
    check(await page.getByText(/synthetic test data/i).count(), `${route} sample-data notice`).toBe(0);
    check(errors, `${route} errors`).toEqual([]);
  } finally {
    page.off("pageerror", onError);
    page.off("console", onConsole);
  }
}

type SearchResult = { kind: string; href: string; label: string };

async function search(request: APIRequestContext, q: string): Promise<SearchResult[]> {
  const res = await request.get(`/api/search/?q=${encodeURIComponent(q)}`);
  expect(res.ok(), `search ${q}`).toBeTruthy();
  return (await res.json()).results as SearchResult[];
}

for (const route of STATIC_ROUTES) {
  test(`renders ${route}`, async ({ page }) => {
    await checkPage(page, route);
  });
}

test("property, town and ranking pages from the real snapshot", async ({ page, request }) => {
  const results = await search(request, "tampines");
  const blocks = results.filter((r) => r.kind === "hdb").map((r) => r.href);
  const town = results.find((r) => r.kind === "town")?.href;
  expect(blocks.length, "HDB blocks found by search").toBeGreaterThanOrEqual(2);
  expect(town, "town found by search").toBeTruthy();
  const [a, b] = blocks.map((h) => h.split("/")[2]);
  console.log(`live: blocks ${blocks.slice(0, 3).join(", ")}; town ${town}`);

  const listsHtml = await (await request.get("/lists/")).text();
  const list = listsHtml.match(/href="(\/lists\/[a-z0-9-]+\/)"/)?.[1];
  const newsHtml = await (await request.get("/news/")).text();
  const article = newsHtml.match(/href="(\/news\/[a-z0-9-]+\/)"/)?.[1];
  expect(list, "a ranking linked from /lists/").toBeTruthy();
  expect(article, "an article linked from /news/").toBeTruthy();

  for (const route of [
    blocks[0],
    blocks[1],
    town!,
    `/supply-demand/${a}/`,
    `/valuation/?ref=hdb:${a}`,
    `/compare/?ids=hdb:${a},hdb:${b}`,
    `/compare-units/?a=hdb:${a}&b=hdb:${b}`,
    list!,
    article!,
  ]) {
    await checkPage(page, route, true);
  }
});

test("canonical URLs, sitemaps and robots use the production origin", async ({ page, request }) => {
  await page.goto("/");
  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  const ogImage = await page.locator('meta[property="og:image"]').first().getAttribute("content");
  console.log(`live: canonical ${canonical}; og:image ${ogImage}`);
  expect(new URL(canonical!).origin).toBe(origin());
  expect(new URL(ogImage!).origin).toBe(origin());

  const robots = await (await request.get("/robots.txt")).text();
  const sitemaps = [...robots.matchAll(/^Sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  console.log(`live: ${sitemaps.length} sitemaps`);
  expect(sitemaps.length).toBeGreaterThanOrEqual(2);
  for (const url of sitemaps) expect(new URL(url).origin).toBe(origin());
  const first = await request.get(new URL(sitemaps[0]).pathname);
  expect(first.ok()).toBeTruthy();
  const locs = (await first.text()).match(/<loc>[^<]+<\/loc>/g) ?? [];
  expect(locs.length).toBeGreaterThan(1000);
  expect(locs.every((l) => l.startsWith(`<loc>${origin()}/`))).toBe(true);
});

test("APIs answer and unknown slugs return 404", async ({ request }) => {
  const results = await search(request, "872a tampines");
  expect(results[0]?.href).toBe("/hdb/blk-872a-tampines-st-86/");
  expect((await request.get("/api/v1/hdb/blocks/blk-872a-tampines-st-86/")).ok()).toBeTruthy();
  const spec = await request.get("/openapi.json");
  expect(spec.ok()).toBeTruthy();
  expect((await spec.json()).servers[0].url).toBe(origin());
  for (const path of ["/hdb/blk-0-no-such-street/", "/condo/no-such-project/", "/landed-street/no-such-street/", "/insights/town/atlantis/"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});

test("language toggle switches chrome to Chinese", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /切换到中文|Switch to English/ }).first().click();
  await expect(page.getByText("估价").filter({ visible: true }).first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans-SG");
});
