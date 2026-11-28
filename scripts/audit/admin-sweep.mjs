/**
 * One clean browser page per admin route: no shared console listeners, so a
 * failure is attributed to the page that caused it. Records every >=400
 * response and every console/page error.
 */
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const BASE = process.env.BASE || "https://staging.ieeesahrdaya.com";
const DATA = process.env.STAGING_DATA_DIR || "/home/drvij/ieee-staging-data";
const CONTAINER = process.env.STAGING_CONTAINER || "ieee-dev-staging-web-1";
const DIR = import.meta.dirname;
const OUT = process.env.AUDIT_OUT || "/tmp/opencode/staging-audit/shots";
const admin = JSON.parse(readFileSync(join(DATA, "db/.staging-test-session"), "utf8"));
mkdirSync(OUT, { recursive: true });

function readFixtures() {
  const out = execFileSync("docker", ["exec", "-i", CONTAINER, "node", "--experimental-sqlite", "-"], {
    input: readFileSync(join(DIR, "fixtures.cjs")), encoding: "utf8", stdio: ["pipe", "pipe", "ignore"],
  });
  return JSON.parse(out.trim().split("\n").pop());
}
const { ids } = readFixtures();
const EVENT_ID = process.env.EVENT_ID || ids.event;
const REG_ID = process.env.REG_ID || ids.registration;
const SOCIETY_ID = process.env.SOCIETY_ID || ids.society;
const EXECOM_ID = process.env.EXECOM_ID || ids.execom;

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
    // Wait for the route's own heading, not just the shell: a slow data-health
    // query used to leave the document at the logo for longer than a fixed wait.
    await page.waitForFunction(() => {
      const text = document.querySelector("h1,h2")?.textContent?.trim() ?? "";
      return text.length > 0 && text !== "IEEE";
    }, { timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(700);
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
