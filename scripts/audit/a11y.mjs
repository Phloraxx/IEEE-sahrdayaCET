/**
 * Accessibility and SEO pass over the public pages, with axe-core injected
 * (context bypasses CSP for the audit only).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
const BASE = process.env.BASE || "https://staging.ieeesahrdaya.com";
const AXE_PATH = "/tmp/opencode/axe-core-4.10.2.min.js";
let AXE;
try {
  AXE = readFileSync(AXE_PATH, "utf8");
} catch {
  AXE = await (await fetch("https://unpkg.com/axe-core@4.10.2/axe.min.js")).text();
  writeFileSync(AXE_PATH, AXE);
}

const paths = ["/", "/events", "/societies", "/full-execom", "/infinia", "/about", "/contact",
  "/pricing", "/verify", "/my-events", "/privacy-policy", "/terms-and-conditions",
  "/refund-and-cancellation-policy", "/shipping-and-delivery-policy", "/societies/wie"];

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true });
const page = await ctx.newPage();
const rows = [];
for (const path of paths) {
  await page.goto(BASE + path, { waitUntil: "load" });
  await page.waitForTimeout(900);
  const meta = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const ids = Array.from(document.querySelectorAll("[id]")).map((e) => e.id);
    const dupIds = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    const nameless = Array.from(document.querySelectorAll("a[href],button")).filter((el) => {
      const name = (el.getAttribute("aria-label") || el.textContent || "").trim() ||
        (el.querySelector("img[alt]")?.getAttribute("alt") || "");
      return !name && !el.getAttribute("aria-hidden");
    }).length;
    const noAlt = Array.from(document.images).filter((i) => !i.hasAttribute("alt")).length;
    return {
      title: document.title,
      description: q('meta[name="description"]')?.getAttribute("content") || "",
      canonical: q('link[rel="canonical"]')?.href || "",
      ogImage: q('meta[property="og:image"]')?.getAttribute("content") || "",
      lang: document.documentElement.lang,
      h1: document.querySelectorAll("h1").length,
      dupIds, nameless, noAlt,
      noindex: /noindex/i.test(document.querySelector('meta[name="robots"]')?.getAttribute("content") || ""),
      jsonLd: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((s) => s.textContent),
    };
  });
  let jsonLdOk = true;
  for (const block of meta.jsonLd) { try { JSON.parse(block); } catch { jsonLdOk = false; } }
  let axe = { violations: [] };
  try {
    await page.addScriptTag({ content: AXE });
    axe = await page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      return { violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })) };
    });
  } catch (e) {
    axe = { error: String(e).slice(0, 120) };
  }
  rows.push({ path, ...meta, jsonLd: meta.jsonLd.length, jsonLdOk, axe });
}

let problems = 0;
for (const r of rows) {
  const metaRequired = !r.noindex;
  const bad = !r.title || (metaRequired && (!r.description || !r.canonical)) || r.h1 !== 1 || r.dupIds.length ||
    r.nameless > 0 || r.noAlt > 0 || !r.jsonLdOk || r.axe.violations?.length;
  if (bad) problems++;
  console.log(`${bad ? "FAIL" : "PASS"}  ${r.path}  h1=${r.h1} nameless=${r.nameless} noAlt=${r.noAlt} dupIds=${r.dupIds.length} jsonLd=${r.jsonLd}${r.jsonLdOk ? "" : "(invalid)"}`);
  for (const v of r.axe.violations ?? []) console.log(`      axe ${v.impact}: ${v.id} ×${v.nodes} — ${v.help}`);
}
await browser.close();
console.log(`\n${rows.length - problems}/${rows.length} pages clean`);
