import { expect, test } from "@playwright/test";

/** Every route family renders against the fixture snapshot without errors and fits a 360px screen. */
const ROUTES = [
  "/",
  "/property-analysis/?q=tampines",
  "/valuation/",
  "/valuation/?ref=hdb:blk-872a-tampines-st-86",
  "/affordability/",
  "/mortgage-rates/",
  "/compare/?ids=hdb:blk-872a-tampines-st-86,condo:aurora-fixture-residences",
  "/compare-units/?a=hdb:blk-872a-tampines-st-86&b=condo:sample-park-condo",
  "/supply-demand/blk-872a-tampines-st-86/",
  "/hdb/blk-872a-tampines-st-86/",
  "/hdb/blk-999-tampines-st-99/",
  "/condo/aurora-fixture-residences/",
  "/condo/the-fixture-ec/",
  "/landed/13-sample-ln/",
  "/landed-street/sample-ln/",
  "/new-launch/condo/aurora-fixture-residences/",
  "/new-launch/condo/upcoming-fixture-towers/",
  "/listings/",
  "/listings/?type=upcoming",
  "/homes/",
  "/homes/fit/",
  "/services/?postal=521872",
  "/lists/",
  "/insights/",
  "/insights/town/tampines/",
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

for (const route of ROUTES) {
  test(`renders ${route}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !IGNORED_CONSOLE.some((r) => r.test(m.text()))) errors.push(`console: ${m.text()}`);
    });
    const res = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${route} status`).toBe(200);
    await page.waitForLoadState("load");
    await expect(page.locator("h1")).toHaveCount(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${route} horizontal overflow (px)`).toBeLessThanOrEqual(1);
    expect(errors, `${route} errors`).toEqual([]);
  });
}

test("unknown property slugs return 404", async ({ request }) => {
  for (const path of ["/hdb/blk-0-no-such-street/", "/condo/no-such-project/", "/landed-street/no-such-street/", "/new-launch/condo/no-such-launch/", "/insights/town/atlantis/"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(404);
  }
});

test("search API and public API respond", async ({ request }) => {
  const s = await request.get("/api/search/?q=872a");
  expect(s.ok()).toBeTruthy();
  expect((await s.json()).results[0].href).toBe("/hdb/blk-872a-tampines-st-86/");
  const spec = await request.get("/openapi.json");
  expect(spec.ok()).toBeTruthy();
  expect((await spec.json()).openapi).toMatch(/^3\./);
});

test("language toggle switches chrome to Chinese", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /切换到中文|Switch to English/ }).first().click();
  await expect(page.getByRole("link", { name: "首页" }).or(page.getByText("估价").first())).toBeVisible();
});
