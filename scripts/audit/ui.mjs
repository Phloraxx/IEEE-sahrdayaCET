/**
 * UI and behaviour pass: rails, navigation, mobile sheet, admin theme,
 * verification result, registration form, console cleanliness.
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
const member = JSON.parse(readFileSync(join(DATA, "db/.staging-test-member"), "utf8"));
mkdirSync(OUT, { recursive: true });

function readFixtures() {
  const out = execFileSync("docker", ["exec", "-i", CONTAINER, "node", "--experimental-sqlite", "-"], {
    input: readFileSync(join(DIR, "fixtures.cjs")), encoding: "utf8", stdio: ["pipe", "pipe", "ignore"],
  });
  return JSON.parse(out.trim().split("\n").pop());
}
const FIXTURES = readFixtures();
const cert = FIXTURES.cert ?? {};
const testEvent = FIXTURES.openEvent;

const results = [];
const check = (id, pass, detail = "") => {
  results.push({ id, pass: Boolean(pass), detail: String(detail).slice(0, 300) });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? `  [${String(detail).slice(0, 160)}]` : ""}`);
};

const browser = await chromium.launch({ args: ["--no-sandbox"] });

async function withContext(opts, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  if (opts?.cookie) {
    await ctx.addCookies([{ name: "__Host-ieee_session", value: opts.cookie, url: BASE, secure: true, httpOnly: true, sameSite: "Lax" }]);
  }
  try { return await fn(ctx); } finally { await ctx.close(); }
}

// --------------------------------------------------------------- public pass
const publicPaths = ["/", "/events", "/societies", "/full-execom", "/infinia", "/about",
  "/contact", "/pricing", "/verify", "/my-events", "/privacy-policy", "/terms-and-conditions",
  "/refund-and-cancellation-policy", "/shipping-and-delivery-policy"];
const pageProblems = [];
await withContext({}, async (ctx) => {
  for (const path of publicPaths) {
    const page = await ctx.newPage();
    const problems = [];
    page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 160)}`); });
    page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 160)}`));
    page.on("response", (r) => {
      if (r.status() >= 400 && !r.url().includes("cloudflareinsights")) problems.push(`${r.status()} ${r.url().replace(BASE, "")}`);
    });
    let status = 0;
    try {
      const res = await page.goto(BASE + path, { waitUntil: "load", timeout: 45000 });
      status = res?.status() ?? 0;
      await page.waitForTimeout(700);
    } catch (e) {
      problems.push(`nav: ${e.message.split("\n")[0]}`);
    }
    const state = await page.evaluate(() => ({
      overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      h1: document.querySelectorAll("h1").length,
      title: document.title,
      broken: Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).length,
      deadInternalAnchors: Array.from(document.querySelectorAll('a[href]'))
        .map((a) => a.getAttribute("href"))
        .filter((h) => h === "" || h === "#").length,
    }));
    if (status !== 200 || problems.length || state.overflow > 2 || !state.h1 || !state.title || state.broken) {
      pageProblems.push({ path, status, problems, ...state });
    }
    if (path === "/" || path === "/events" || path === "/full-execom") {
      await page.screenshot({ path: `${OUT}/ui${path.replace(/\//g, "_") || "_home"}.png` });
    }
    await page.close();
  }
});
check("public pages: no console errors, 404s, broken images, overflow", pageProblems.length === 0, JSON.stringify(pageProblems).slice(0, 500));

// ------------------------------------------------------------------ nav
await withContext({}, async (ctx) => {
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "load" });
  for (const [label, path] of [["EVENTS", "/events"], ["INFINIA", "/infinia"], ["SOCIETIES", "/societies"], ["EXECOM", "/full-execom"]]) {
    await page.goto(BASE + "/", { waitUntil: "load" });
    await page.getByRole("link", { name: label, exact: true }).first().click();
    await page.waitForURL("**" + path);
    check(`nav ${label} → ${path}`, new URL(page.url()).pathname === path, page.url());
  }
  const logo = page.locator('a[href="/"]').first();
  check("logo home link", (await logo.count()) > 0, "");
});

// ------------------------------------------------------------- mobile sheet
await withContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, async (ctx) => {
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth));
  check("mobile home: no horizontal overflow", overflow === 0, overflow);
  await page.locator("[data-mobile-more-trigger]").click();
  await page.waitForTimeout(600);
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'))
      .filter((a) => a.offsetParent !== null)
      .map((a) => ({ href: a.getAttribute("href"), text: a.innerText.trim().slice(0, 40) })),
  );
  check("mobile More sheet opens", links.some((l) => /contact|verify|pricing|about/i.test(l.text)), links.map((l) => l.text).filter(Boolean).slice(0, 8).join(" | "));
  await page.screenshot({ path: `${OUT}/mobile-more.png` });
  await page.keyboard.press("Escape");
  const moreVisibleAfterEscape = await page.locator("[data-mobile-more-trigger]").isVisible();
  check("More sheet closes on Escape", moreVisibleAfterEscape, "");
  await page.getByRole("link", { name: /events/i }).first().click();
  await page.waitForURL("**/events");
  check("mobile bottom nav Events", new URL(page.url()).pathname === "/events", page.url());
  await page.screenshot({ path: `${OUT}/mobile-events.png` });
});

// --------------------------------------------------------------- rails
async function railProbe(width, height, reduced) {
  return withContext({ viewport: { width, height }, reducedMotion: reduced ? "reduce" : "no-preference" }, async (ctx) => {
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const execom = page.locator("[data-home-execom-track]");
    const events = page.locator('[data-testid="curated-event-strip"]');
    // Each rail only paints once it is on screen; scroll each into view first.
    const scrollTo = async (locator) => {
      await locator.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 180));
      await page.waitForTimeout(1600);
    };
    const measure = async (locator, ms = 1500) => {
      const read = () => locator.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
      const a = await read();
      await page.waitForTimeout(ms);
      const b = await read();
      return Number(((b - a) / (ms / 1000)).toFixed(1));
    };
    let execomSpeed = null, eventsSpeed = null;
    if (await execom.count()) { await scrollTo(execom); execomSpeed = await measure(execom); }
    if (await events.count()) { await scrollTo(events); eventsSpeed = await measure(events); }
    let drag = null;
    if (!reduced && (await execom.count())) {
      const box = await execom.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + box.width / 2 - i * 30, box.y + box.height / 2);
        await page.mouse.up();
        drag = "ok";
      }
    }
    return { width, height, reduced, execomSpeed, eventsSpeed, drag };
  });
}
const rails = [];
for (const [w, h, r] of [[2000, 700, false], [1440, 900, false], [390, 844, false], [2000, 700, true]]) {
  rails.push(await railProbe(w, h, r));
}
check("execom rail cruises ~33 px/s", rails.filter((r) => !r.reduced).every((r) => r.execomSpeed !== null && Math.abs(Math.abs(r.execomSpeed) - 33) < 4), JSON.stringify(rails));
check("events rail cruises ~33 px/s", rails.filter((r) => !r.reduced).every((r) => r.eventsSpeed !== null && Math.abs(Math.abs(r.eventsSpeed) - 33) < 4), JSON.stringify(rails));
check("rails match each other", rails.filter((r) => !r.reduced && r.execomSpeed !== null && r.eventsSpeed !== null).every((r) => Math.abs(Math.abs(r.execomSpeed) - Math.abs(r.eventsSpeed)) < 3), "");
check("reduced motion stops the cruise", rails.filter((r) => r.reduced).every((r) => r.execomSpeed === null || Math.abs(r.execomSpeed) < 1), JSON.stringify(rails.at(-1)));

// ------------------------------------------------------------- verification
await withContext({}, async (ctx) => {
  const page = await ctx.newPage();
  const token = cert?.verification_token ?? "";
  const credentialId = cert?.credential_id ?? "";
  await page.goto(`${BASE}/c/${token}`, { waitUntil: "load" });
  await page.waitForTimeout(800);
  const text = await page.locator("body").innerText();
  check("certificate record shows recipient", /Sourav/i.test(text), text.slice(0, 160).replace(/\n/g, " "));
  await page.goto(`${BASE}/verify?id=${credentialId}`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const verifyText = await page.locator("body").innerText();
  check("verify page resolves the credential id", /valid|verified|Sourav/i.test(verifyText), verifyText.slice(0, 200).replace(/\n/g, " "));
});

// -------------------------------------------------- registration form (UI)
await withContext({ cookie: member.cookie }, async (ctx) => {
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(`${BASE}/register/a0000000-0000-4000-8000-000000000001`, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  const body = await page.locator("body").innerText();
  check("registration page renders signed-in form", /full name/i.test(body) && /phone/i.test(body) && /college/i.test(body), body.slice(0, 200).replace(/\n/g, " "));
  check("registration page has no page errors", errors.length === 0, errors.join(" | "));
});

// ------------------------------------------------------------- admin theme
await withContext({ cookie: admin.cookie }, async (ctx) => {
  const page = await ctx.newPage();
  await page.goto(BASE + "/admin/dashboard", { waitUntil: "load" });
  await page.waitForTimeout(1200);
  const before = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  await page.getByRole("button", { name: /switch to (light|dark) mode/i }).first().click();
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  check("admin theme toggles", before !== after, `${before} → ${after}`);
  console.log(`      (admin default is ${before ? "dark" : "light"})`);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(800);
  const persisted = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  check("admin theme persists across reload", persisted === after, `${after} → ${persisted}`);
  await page.screenshot({ path: `${OUT}/admin-light.png` });

  // Search on events
  await page.goto(BASE + "/admin/events", { waitUntil: "load" });
  await page.waitForTimeout(1200);
  const search = page.locator('input[placeholder="Search events…"]').first();
  if (await search.count()) {
    await search.fill("workshop");
    await page.waitForTimeout(900);
    const titles = (await page.locator('a[href^="/admin/events/"]:not([href="/admin/events/new"])').allInnerTexts()).filter((t) => t.trim() !== "Open");
    check("admin events search filters", titles.length > 0 && titles.every((t) => /workshop/i.test(t)), `${titles.length}: ${titles.slice(0, 3).join(" | ")}`);
  } else {
    check("admin events search filters", false, "no search input");
  }
});

// ------------------------------------------------------------ check-in page
await withContext({ cookie: admin.cookie }, async (ctx) => {
  const page = await ctx.newPage();
  const problems = [];
  page.on("response", (r) => { if (r.status() >= 400) problems.push(`${r.status()} ${r.url().replace(BASE, "")}`); });
  await page.goto(BASE + "/admin/check-in", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const body = await page.locator("body").innerText();
  check("admin check-in renders", /check.?in/i.test(body) && problems.length === 0, problems.slice(0, 3).join(" | "));
  await page.screenshot({ path: `${OUT}/admin-checkin.png` });
});

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} UI checks passed`);
if (failed.length) { console.log("FAILURES:"); for (const f of failed) console.log(` - ${f.id}: ${f.detail}`); }
