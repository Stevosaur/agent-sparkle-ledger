// Dev helper: sign in and screenshot pages. Usage: node scripts/dev/shot.mjs /dashboard /market ...
import { chromium } from "@playwright/test";
const base = process.env.BASE ?? "http://localhost:3000";
const email = process.env.EMAIL ?? "procurement@demo.pasarcatch.sg";
const out = process.env.OUT ?? "/tmp/shots";
const mobile = process.env.MOBILE === "1";
const browser = await chromium.launch(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {});
const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "dark" });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 300)); });
await page.goto(`${base}/login`);
await page.fill('[data-testid="login-email"]', email);
await page.fill('[data-testid="login-password"]', "pasarcatch-demo");
await page.click('[data-testid="login-submit"]');
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
for (const p of process.argv.slice(2)) {
  const t0 = Date.now();
  const res = await page.goto(`${base}${p}`, { waitUntil: "networkidle", timeout: 120000 });
  const name = p.replaceAll("/", "_").replace(/[?=&]/g, "-") || "root";
  await page.screenshot({ path: `${out}/${mobile ? "m" : "d"}${name}.png`, fullPage: process.env.FULL === "1" });
  console.log(p, res?.status(), `${Date.now() - t0}ms`);
}
await browser.close();
