// Temporary: REA (https://github.com/morluto/rea) capture of a site's public pages for a product teardown.
// Polite: sequential, honours robots.txt, a pause between pages, no logins, no form submissions, no response bodies.
// Output (OUT_DIR): per page a11y text + screenshots, network log, discovered links, bundle analysis, sitemap summary.
// env: BASE (site origin), CHROME (browser executable), OUT_DIR, MAX_PAGES, DELAY_MS, SEEDS (comma-separated paths)
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.BASE ?? "https://haio.sg").replace(/\/$/, "");
const CHROME = process.env.CHROME ?? "/usr/bin/google-chrome";
const OUT = path.resolve(process.env.OUT_DIR ?? "rea-out");
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 70);
const DELAY_MS = Number(process.env.DELAY_MS ?? 2500);
const REA = process.env.REA_BIN ?? "rea";
const SEEDS = (process.env.SEEDS ?? "/").split(",").map((s) => s.trim()).filter(Boolean);
const BUNDLE_PAGES = (process.env.BUNDLE_PAGES ?? "/").split(",").map((s) => s.trim()).filter(Boolean);
const PER_FAMILY = Number(process.env.PER_FAMILY ?? 2);

fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const safe = (s) => String(s).replace(/^\/|\/$/g, "").replace(/[^a-z0-9._-]+/gi, "_").slice(0, 90) || "home";
const hasConvert = spawnSync("convert", ["-version"]).status === 0;

/* ---------------- robots.txt ---------------- */
async function fetchText(url) {
  try {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (REA teardown; polite)" }, redirect: "follow" });
    return { status: res.status, text: res.ok ? await res.text() : "" };
  } catch (e) {
    return { status: 0, text: "", error: String(e) };
  }
}
const robots = await fetchText(`${BASE}/robots.txt`);
fs.writeFileSync(path.join(OUT, "robots.txt"), `status ${robots.status}\n${robots.text}`);
const rules = []; // { allow: bool, path }
const sitemapsFromRobots = [];
{
  let applies = false;
  for (const raw of robots.text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") applies = val === "*";
    else if (key === "sitemap") sitemapsFromRobots.push(val);
    else if (applies && (key === "disallow" || key === "allow") && val) rules.push({ allow: key === "allow", path: val });
  }
}
function allowed(p) {
  let best = null;
  for (const r of rules) {
    const re = new RegExp("^" + r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (re.test(p) && (!best || r.path.length > best.path.length)) best = r;
  }
  return !best || best.allow;
}
log(`robots ${robots.status}: ${rules.length} rules, ${sitemapsFromRobots.length} sitemaps`);

/* ---------------- sitemap summary (index + one child per kind) ---------------- */
const familySamples = new Map(); // family -> [paths]
function familyOf(p) {
  const [pathname, query] = p.split("?");
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0) return "home";
  if (segs[0] === "listings" && query) return `listings?${query.split("&")[0]}`;
  if (segs.length === 1) return segs[0];
  if (segs[0] === "new-launch" && segs.length >= 3) return `new-launch/${segs[1]}/*`;
  return `${segs[0]}/*`;
}
function addSample(p, n = 5) {
  const f = familyOf(p);
  const arr = familySamples.get(f) ?? [];
  if (arr.length < n && !arr.includes(p)) arr.push(p);
  familySamples.set(f, arr);
}
const sitemapSummary = { index: [], children: [] };
{
  const roots = sitemapsFromRobots.length ? sitemapsFromRobots : [`${BASE}/sitemap.xml`];
  const seenKinds = new Set();
  for (const root of roots.slice(0, 3)) {
    const sm = await fetchText(root);
    const locs = [...sm.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
    const isIndex = /<sitemapindex/i.test(sm.text);
    sitemapSummary.index.push({ url: root, status: sm.status, index: isIndex, entries: locs.length });
    const children = isIndex ? locs : [];
    if (!isIndex) for (const l of locs) addSample(new URL(l).pathname + new URL(l).search);
    for (const child of children) {
      const kind = child.replace(/[-_]?\d+(\.xml)?$/i, "").replace(/\.xml$/i, "");
      sitemapSummary.children.push(child);
      if (seenKinds.has(kind) || seenKinds.size >= 12) continue;
      seenKinds.add(kind);
      await sleep(DELAY_MS);
      const c = await fetchText(child);
      const cl = [...c.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
      const fam = {};
      for (const l of cl) {
        try {
          const u = new URL(l);
          const p = u.pathname + u.search;
          fam[familyOf(p)] = (fam[familyOf(p)] ?? 0) + 1;
          addSample(p);
        } catch {}
      }
      sitemapSummary[`child:${child}`] = { status: c.status, urls: cl.length, families: fam };
    }
  }
  sitemapSummary.familySamples = Object.fromEntries(familySamples);
  fs.writeFileSync(path.join(OUT, "sitemap-summary.json"), JSON.stringify(sitemapSummary, null, 2));
  log(`sitemap: ${sitemapSummary.children.length} child sitemaps, ${familySamples.size} families sampled`);
}

/* ---------------- page queue with family-based discovery ---------------- */
const queue = [];
const queued = new Set();
const familyCount = new Map();
function enqueue(p, why) {
  if (!p.startsWith("/")) return;
  p = p.replace(/#.*$/, "");
  if (queued.has(p) || queue.length + done.length >= MAX_PAGES * 3) return;
  const fam = familyOf(p);
  const limit = fam.endsWith("/*") ? PER_FAMILY : 1;
  if ((familyCount.get(fam) ?? 0) >= limit) return;
  if (!allowed(p)) {
    skipped.push(`${p}\trobots`);
    return;
  }
  queued.add(p);
  familyCount.set(fam, (familyCount.get(fam) ?? 0) + 1);
  queue.push({ p, why });
}
const done = [];
const skipped = [];
for (const s of SEEDS) enqueue(s, "seed");
for (const [, samples] of familySamples) if (samples[0]) enqueue(samples[0], "sitemap");

/* ---------------- REA scenario per page and viewport ---------------- */
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844, scrolls: 2 },
  { name: "desktop", width: 1280, height: 900, scrolls: 3 },
];
function scenarioFor(p, vp) {
  const actions = [{ step_id: "settle", action: "wait_for_timeout", duration_ms: 3500 }];
  for (let i = 1; i <= vp.scrolls; i++) {
    actions.push({ step_id: `scroll${i}`, action: "press", locator: { kind: "css", selector: "body" }, key: "PageDown", timeout_ms: 5000 });
    actions.push({ step_id: `scroll${i}-settle`, action: "wait_for_timeout", duration_ms: 900 });
  }
  return {
    browser: { mode: "launch", executable_path: CHROME },
    environment: { viewport: { width: vp.width, height: vp.height, device_scale_factor: 1 }, locale: "en-SG", timezone: "Asia/Singapore", service_workers: "block" },
    start_url: { url: BASE + p },
    actions,
    capture: { after_each_step: ["screenshot", "accessibility", "url"], at_end: ["url"], events: ["network", "console", "page-errors"] },
  };
}

const netRows = ["page\tviewport\tmethod\tstatus\ttype\turl"];
const pageRows = ["page\tviewport\tstatus\tfinal_url\th1\tnetwork\tconsole_errors"];
const consoleRows = [];

function digest(p, vp, capture) {
  const r = capture.normalized_result ?? capture;
  const dir = path.join(OUT, "pages", safe(p) + (p.includes("?") ? "_q" : ""));
  fs.mkdirSync(dir, { recursive: true });
  let a11yWritten = false;
  let h1 = "";
  let finalUrl = "";
  const links = new Set();
  for (const step of r.steps ?? []) {
    const a = step.artifacts ?? {};
    if (a.url?.state === "captured") finalUrl = a.url.value.url;
    const text = a.accessibility?.state === "captured" ? a.accessibility.value.text ?? "" : "";
    if (text && (!a11yWritten || step.step_id === "settle")) {
      fs.writeFileSync(path.join(dir, `${vp.name}.a11y.txt`), text);
      a11yWritten = true;
      h1 = (text.match(/heading "([^"]+)" \[level=1\]/) ?? [])[1] ?? h1;
    }
    for (const m of text.matchAll(/\/url: "?([^"\n]+)"?/g)) links.add(m[1].trim());
    if (a.screenshot?.state === "captured" && a.screenshot.value?.data_base64 && step.step_id !== "scenario_start" && !step.step_id.endsWith("-settle")) {
      const png = path.join(dir, `${vp.name}-${String(step.step_index).padStart(2, "0")}-${step.step_id}.png`);
      fs.writeFileSync(png, Buffer.from(a.screenshot.value.data_base64, "base64"));
      if (hasConvert) {
        const jpg = png.replace(/\.png$/, ".jpg");
        if (spawnSync("convert", [png, "-quality", "72", jpg]).status === 0) fs.rmSync(png);
      }
    }
  }
  const items = r.events?.items ?? [];
  const tx = new Map();
  let consoleErrors = 0;
  for (const e of items) {
    if (e.kind === "console" || e.kind === "page-error") {
      if (e.kind === "page-error" || e.level === "error") consoleErrors++;
      consoleRows.push([p, vp.name, e.kind, e.level ?? "", String(e.text ?? e.message ?? "").slice(0, 200).replace(/\s+/g, " ")].join("\t"));
    }
    if (!e.transaction_id) continue;
    const t = tx.get(e.transaction_id) ?? { method: e.method, url: e.url?.url, type: e.resource_type, status: "" };
    if (e.kind === "response") t.status = e.status;
    if (e.kind === "request-failed") t.status = "FAILED";
    tx.set(e.transaction_id, t);
  }
  for (const t of tx.values()) netRows.push([p, vp.name, t.method, t.status, t.type, t.url].join("\t"));
  const status = (r.steps ?? []).map((s) => s.status).includes("failed") ? "partial" : "ok";
  pageRows.push([p, vp.name, status, finalUrl, h1, tx.size, consoleErrors].join("\t"));
  return links;
}

function runRea(args, timeoutMs) {
  const res = spawnSync(REA, args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024, timeout: timeoutMs });
  if (res.status !== 0) return { error: (res.stderr || res.error?.message || "").slice(-600) };
  try {
    return { json: JSON.parse(res.stdout) };
  } catch (e) {
    return { error: `unparseable output: ${String(e).slice(0, 200)}` };
  }
}

while (queue.length && done.length < MAX_PAGES) {
  const { p, why } = queue.shift();
  log(`[${done.length + 1}/${MAX_PAGES}] ${p} (${why})`);
  const discovered = new Set();
  for (const vp of VIEWPORTS) {
    const file = path.join(OUT, `scenario-${vp.name}.json`);
    fs.writeFileSync(file, JSON.stringify(scenarioFor(p, vp)));
    const res = runRea(["capture-browser-scenario", file, "--json"], 180_000);
    if (res.error) {
      pageRows.push([p, vp.name, "error", "", res.error.replace(/\s+/g, " ").slice(0, 300), 0, 0].join("\t"));
      log(`   ${vp.name}: error ${res.error.replace(/\s+/g, " ").slice(0, 200)}`);
      continue;
    }
    for (const l of digest(p, vp, res.json)) discovered.add(l);
    await sleep(DELAY_MS);
  }
  done.push(p);
  for (const l of discovered) {
    try {
      const u = l.startsWith("http") ? new URL(l) : new URL(l, BASE);
      if (u.origin === new URL(BASE).origin) enqueue(u.pathname + u.search, `link from ${p}`);
    } catch {}
  }
  fs.writeFileSync(path.join(OUT, "pages.tsv"), pageRows.join("\n") + "\n");
  fs.writeFileSync(path.join(OUT, "network.tsv"), netRows.join("\n") + "\n");
}
fs.writeFileSync(path.join(OUT, "console.tsv"), consoleRows.join("\n") + "\n");
fs.writeFileSync(path.join(OUT, "skipped.tsv"), [...skipped, ...queue.map((q) => `${q.p}\tnot reached (MAX_PAGES)`)].join("\n") + "\n");
fs.writeFileSync(path.join(OUT, "families.json"), JSON.stringify(Object.fromEntries(familyCount), null, 2));

/* ---------------- static bundle analysis (routes, endpoints, vendors) on a few pages ---------------- */
for (const p of BUNDLE_PAGES) {
  if (!allowed(p)) continue;
  const port = 9333;
  const profile = fs.mkdtempSync(path.join(OUT, ".profile-"));
  const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "--password-store=basic", "--window-size=1280,900", BASE + p], { stdio: "ignore" });
  await sleep(9000);
  const targets = runRea(["list-browser-targets", `http://127.0.0.1:${port}`, "--json"], 60_000);
  const target = targets.json?.normalized_result?.targets?.find((t) => t.url.startsWith(BASE));
  if (target) {
    const bundle = runRea(["analyze-web-bundle", `http://127.0.0.1:${port}`, target.target_id, "--json"], 300_000);
    fs.writeFileSync(path.join(OUT, `bundle-${safe(p)}.json`), JSON.stringify(bundle.json?.normalized_result ?? bundle, null, 1));
    const inspect = runRea(["inspect-web-page", `http://127.0.0.1:${port}`, target.target_id, "--observation-ms", "4000", "--include-json-body-shapes", "--json"], 300_000);
    const ir = inspect.json?.normalized_result;
    // keep structure-level facts only: resources, response metadata, network request list with JSON shapes, storage key names
    fs.writeFileSync(path.join(OUT, `inspect-${safe(p)}.json`), JSON.stringify(ir ? { resources: ir.resources, network: ir.network, metadata: ir.metadata, storage: ir.storage, scripts: { total: ir.scripts?.total, items: (ir.scripts?.items ?? []).map((s) => ({ url: s.url, bytes: s.length ?? s.bytes, source_map: s.source_map_url ?? null })) } } : inspect, null, 1));
    log(`bundle ${p}: ${bundle.error ? "error" : "ok"}; inspect ${inspect.error ? "error" : "ok"}`);
  } else log(`bundle ${p}: no target (${targets.error ?? "none"})`);
  chrome.kill("SIGKILL");
  await sleep(1500);
  fs.rmSync(profile, { recursive: true, force: true });
  await sleep(DELAY_MS);
}
for (const f of ["scenario-mobile.json", "scenario-desktop.json"]) fs.rmSync(path.join(OUT, f), { force: true });
log(`done: ${done.length} pages, ${skipped.length} skipped by robots, ${queue.length} not reached`);
