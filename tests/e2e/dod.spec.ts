import { expect, test, type Page } from "@playwright/test";

/**
 * Definition-of-done story, driven through the UI exactly as a demonstrator would:
 * WhatsApp → draft lot → confirm → shortage → second offer → AI recommendation → approve →
 * receive → allocate → pick → route → dispatch → supplier invoice → three-way match → trace.
 */
const PASSWORD = "pasarcatch-demo";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function send(page: Page, vendor: string, text: string) {
  await page.getByTestId("sim-vendor").selectOption({ label: vendor });
  await page.getByTestId("sim-text").fill(text);
  await page.getByTestId("sim-send").click();
  await expect(page.getByTestId("created-lots")).toBeVisible();
  return (await page.getByTestId("created-lot").first().textContent())!.trim();
}

test.describe.configure({ mode: "serial" });

test("login shows the demo dashboard", async ({ page }) => {
  await login(page, "procurement@demo.pasarcatch.sg");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByTestId("demo-badge")).toBeVisible();
  await expect(page.getByTestId("kpis")).toContainText("Expected supply");
});

test("the full overnight flow from WhatsApp to traceable invoice", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "owner@demo.pasarcatch.sg");

  // Tonight's Market
  await page.goto("/market");
  await expect(page.getByTestId("market-table")).toBeVisible();
  await expect(page.getByTestId("market-row-SPM").locator("xpath=ancestor::tr")).toContainText("SHORT");

  // 1–3. Supplier WhatsApp → AI draft lot → manager confirms & buys
  await page.goto("/supply/intake");
  const lot = await send(page, "Ah Seng Fishing", "Tonight 65kg batang, around 600-800g, asking 8.80. Boat reach 1.30.");
  await expect(page.getByTestId("extraction")).toContainText("Spanish mackerel");
  await expect(page.getByTestId("extraction")).toContainText("65 kg");
  await expect(page.getByTestId("extraction")).toContainText("No ambiguous fields");
  await page.reload();
  await page.getByTestId(`confirm-buy-${lot}`).click();
  await expect(page.getByText("Confirmed and purchased")).toBeVisible();

  // 4. Demand still exceeds supply
  await page.goto("/market");
  await expect(page.getByTestId("market-row-SPM").locator("xpath=ancestor::tr")).toContainText("SHORT");

  // 5. Second supplier offers additional stock
  await page.goto("/supply/intake");
  const offer = await send(page, "Nelayan Jaya Johor", "Can give 40kg batang 1-2kg size @ 8.50, reach 2.45");
  await page.reload();
  await page.getByTestId(`confirm-offer-${offer}`).click();
  await expect(page.getByText("Lot confirmed")).toBeVisible();

  // 6–7. Procurement agent recommends a purchase → manager approves
  await page.goto("/ai/approvals");
  const rec = page.getByTestId("approval-card").filter({ hasText: /batang|spanish mackerel/i }).filter({ hasText: "Nelayan Jaya Johor" });
  await expect(rec).toBeVisible();
  await rec.getByTestId("approve-btn").click();
  await expect(page.getByText("Approved — executed")).toBeVisible();

  // 8. Seafood arrives; receiving records actual weight
  await page.goto("/receive");
  await page.getByTestId(`receive-pick-${lot}`).click();
  await page.getByTestId("receive-weight").fill("61.2");
  await page.getByTestId("receive-temp").fill("2");
  await page.getByTestId("grade-A").click();
  await page.getByTestId("receive-accept").click();
  await expect(page.getByTestId("receive-done")).toContainText("-5.8%");

  // 9. Allocation engine distributes supply between buyers (Allocation Agent proposal → approve)
  await page.goto("/ai/approvals");
  const alloc = page.getByTestId("approval-card").filter({ hasText: /Allocate .* spanish mackerel/i });
  await expect(alloc.first()).toBeVisible();
  await alloc.first().getByTestId("approve-btn").click();
  await expect(page.getByText("Approved — executed")).toBeVisible();

  // 10. Orders move into picking
  await page.goto("/operations/picking");
  await page.getByTestId("generate-pick-list").click();
  await expect(page.getByText(/PICK-\d+ started/)).toBeVisible();
  await page.reload();
  const packButtons = page.locator('[data-testid^="pick-pack-"]');
  const n = await packButtons.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    await page.locator('[data-testid^="pick-pack-"]').first().click();
    await expect(page.getByText("Picked & packed").last()).toBeVisible();
    await page.reload();
  }

  // 11. A delivery route is produced
  await page.goto("/operations/routes");
  await page.getByTestId("plan-routes").click();
  await expect(page.getByText(/delivery run\(s\) planned/)).toBeVisible();

  // 12. Goods are dispatched
  await page.goto("/operations/dispatch");
  const dispatchButtons = page.locator('[data-testid^="dispatch-RUN-"]');
  const runs = await dispatchButtons.count();
  expect(runs).toBeGreaterThan(0);
  for (let i = 0; i < runs; i++) {
    await page.locator('[data-testid^="dispatch-RUN-"]').first().click();
    await expect(page.getByText("Truck dispatched").last()).toBeVisible();
    await page.reload();
  }

  // 13–14. Supplier invoice arrives (billing the declared 65 kg) → three-way matching flags it
  await page.goto(`/trace?q=${lot.slice(-4)}`);
  await page.getByTestId("trace-chain").getByRole("link", { name: /^PO-\d+$/ }).click();
  await page.getByTestId("simulate-invoice-declared").click();
  await expect(page.getByText(/received — matching/)).toBeVisible();
  await page.reload();
  await page.locator('a[href^="/finance/reconciliation/"]').first().click();
  await expect(page.getByTestId("match-status")).toContainText(/exception/i);
  await expect(page.getByTestId("match-summary")).toContainText("33.44");

  // 15. Trace the lot number: supplier → receiving → allocation → customer → delivery → invoice
  await page.goto(`/trace?q=${lot.slice(-4)}`);
  const chain = page.getByTestId("trace-chain");
  await expect(chain).toContainText("Ah Seng Fishing");
  await expect(chain).toContainText("61.2 kg");
  await expect(chain).toContainText(/RUN-\d+/);
  await expect(chain).toContainText(/SUP-\d+/);
  await expect(page.getByTestId("timeline")).toContainText("Received");
});
