/**
 * One clean browser page per admin route: no shared console listeners, so a
 * failure is attributed to the page that caused it. Records every >=400
 * response and every console/page error.
 */
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import Database from "better-sqlite3";

const BASE = process.env.BASE || "https://staging.ieeesahrdaya.com";
const DATA = process.env.STAGING_DATA_DIR || "/home/drvij/ieee-staging-data";
const DB = process.env.STAGING_DB || join(DATA, "db/portal.db");
const OUT = process.env.AUDIT_OUT || "/tmp/opencode/staging-audit/shots";
const admin = JSON.parse(readFileSync(join(DATA, "db/.staging-test-session"), "utf8"));
mkdirSync(OUT, { recursive: true });

const db = new Database(DB, { readonly: true });
const pick = (sql, fallbackEnv) => db.prepare(sql).get()?.id || process.env[fallbackEnv] || "";
const EVENT_ID = pick("SELECT id FROM events ORDER BY date DESC LIMIT 1", "EVENT_ID");
const REG_ID = pick("SELECT id FROM registrations LIMIT 1", "REG_ID");
const SOCIETY_ID = pick("SELECT id FROM societies LIMIT 1", "SOCIETY_ID");
const EXECOM_ID = pick("SELECT id FROM execom LIMIT 1", "EXECOM_ID");
db.close();

const routes = [
  "/admin/dashboard",
  "/admin/events",
  "/admin/events/new",
  `/admin/events/${EVENT_ID}`,
  `/admin/events/${EVENT_ID}/edit`,
  "/admin/registrations",
  `/admin/registrations/${REG_ID}`,
  "/admin/payments",
  "/admin/certificates",
  "/admin/societies",
  "/admin/societies/new",
  `/admin/societies/${SOCIETY_ID}/edit`,
  "/admin/execom",
  "/admin/execom/new",
  `/admin/execom/${EXECOM_ID}/edit`,
  "/admin/users",
  "/admin/access",
  "/admin/check-in",
  "/admin/data-health",
];

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const results = [];
for (const route of routes) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: "__Host-ieee_session", value: admin.cookie, url: BASE, secure: true, httpOnly: true, sameSite: "Lax" }]);
  const page = await ctx.newPage();
  const problems = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`));
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, "")}`);
  });
  let status = 0;
  try {
    const res = await page.goto(BASE + route, { waitUntil: "load", timeout: 45000 });
    status = res?.status() ?? 0;
    await page.waitForTimeout(1800);
  } catch (e) {
    problems.push(`nav: ${e.message.split("\n")[0]}`);
  }
  const state = await page.evaluate(() => ({
    heading: document.querySelector("h1,h2")?.textContent?.trim().slice(0, 80) ?? "",
    overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    buttons: document.querySelectorAll("button").length,
  }));
  results.push({ route, status, ...state, problems: [...new Set(problems)] });
  if (["/admin/dashboard", "/admin/check-in", "/admin/certificates"].includes(route)) {
    await page.screenshot({ path: `${OUT}/sweep${route.replace(/\//g, "_")}.png` });
  }
  await ctx.close();
}
await browser.close();

let failures = 0;
for (const r of results) {
  const bad = r.status !== 200 || r.problems.length || r.overflow > 2 || !r.heading;
  if (bad) failures++;
  console.log(`${bad ? "FAIL" : "PASS"}  ${r.route}  status=${r.status} heading="${r.heading}" overflow=${r.overflow}${r.problems.length ? "\n      " + r.problems.join("\n      ") : ""}`);
}
console.log(`\n${results.length - failures}/${results.length} admin routes clean`);
