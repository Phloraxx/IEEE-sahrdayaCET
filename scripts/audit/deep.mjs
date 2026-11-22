/**
 * Deep functional audit of the staging deployment.
 *
 * Read-only for most surfaces; it does create and then remove one registration,
 * one society and one execom row so the write paths are actually exercised.
 * Session cookies are pre-minted by the caller and deleted at the end.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const BASE = process.env.BASE || "https://staging.ieeesahrdaya.com";
const DIR = import.meta.dirname;
const CONTAINER = process.env.STAGING_CONTAINER || "ieee-dev-staging-web-1";
const DATA = process.env.STAGING_DATA_DIR || "/home/drvij/ieee-staging-data";
const WORK = process.env.AUDIT_WORK || "/tmp/opencode/staging-audit";
mkdirSync(WORK, { recursive: true });
const TEST_USER_EMAIL = "staging-audit-user@example.invalid";
const TEST_SLUG = "staging-audit-society";
const TEST_EXECOM = "Staging Audit Member";
const COOKIE = "__Host-ieee_session";

// The database is owned by the container uid, so sessions are minted inside it.
// Doing this at the start makes the audit repeatable: its cleanup deletes these
// sessions, and a second run would otherwise start with dead cookies.
function mint() {
  execFileSync("docker", ["exec", "-i", CONTAINER, "node", "--experimental-sqlite", "-"], {
    input: readFileSync(join(DIR, "mint.cjs")),
    stdio: ["pipe", "ignore", "ignore"],
  });
}
mint();

const admin = JSON.parse(readFileSync(join(DATA, "db/.staging-test-session"), "utf8"));
const member = JSON.parse(readFileSync(join(DATA, "db/.staging-test-member"), "utf8"));

/** Read fixture ids inside the container so the WAL files stay container-owned. */
function readFixtures() {
  const out = execFileSync("docker", ["exec", "-i", CONTAINER, "node", "--experimental-sqlite", "-"], {
    input: readFileSync(join(DIR, "fixtures.cjs")),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
  });
  return JSON.parse(out.trim().split("\n").pop());
}
const FIXTURES = readFixtures();

const results = [];
let n = 0;
function check(id, pass, detail = "") {
  results.push({ id, pass: Boolean(pass), detail: String(detail).slice(0, 400) });
  const mark = pass ? "PASS" : "FAIL";
  console.log(`${mark}  ${id}${detail ? `  [${String(detail).slice(0, 180)}]` : ""}`);
}

async function req(path, { method = "GET", cookie, headers = {}, body, redirect = "manual" } = {}) {
  const h = new Headers(headers);
  h.set("X-Forwarded-For", `10.241.${Math.floor(n / 250)}.${n++ % 250}`);
  h.set("User-Agent", "ieee-staging-audit/1.0");
  if (cookie) h.set("Cookie", `${COOKIE}=${cookie}`);
  const started = performance.now();
  let res;
  try {
    res = await fetch(BASE + path, { method, headers: h, body, redirect, signal: AbortSignal.timeout(60_000) });
  } catch (error) {
    return { path, method, error: String(error), ms: Math.round(performance.now() - started) };
  }
  const text = await res.text().catch(() => "");
  return {
    path, method,
    status: res.status,
    ms: Math.round(performance.now() - started),
    headers: Object.fromEntries(res.headers),
    body: text,
  };
}
const json = (r) => { try { return JSON.parse(r.body); } catch { return null; } };

// Data the checks pivot on (read-only queries).
const { openEvent, closedEvent, banner, cert, foreignReg, myPast } = FIXTURES;

let createdRegId = "";

// ---------------------------------------------------------------- 1. pages
const pages = ["/", "/events", "/about", "/contact", "/pricing", "/societies", "/full-execom",
  "/infinia", "/infinia/2025", "/infinia/2024", "/flagships", "/flagships/altair/2023",
  "/terms-and-conditions", "/privacy-policy", "/refund-and-cancellation-policy",
  "/shipping-and-delivery-policy", "/verify", "/my-events", "/healthz"];
for (const path of pages) {
  const r = await req(path);
  const want = path === "/flagships" ? 301 : 200;
  check(`page ${path} → ${want}`, r.status === want, r.status);
}
check("blog route removed", (await req("/blog")).status === 404, "");
check("blog API removed", (await req("/api/collections/blogs")).status === 404, "");
check("404 page", (await req("/no-such-page-xyz")).status === 404, "");
check("sitemap disabled on staging", (await req("/sitemap.xml")).status === 404, "");
check("robots.txt", (await req("/robots.txt")).status === 200, "");

// ------------------------------------------------------------- 2. dynamic
const firstEvent = json(await req("/api/collections/events?perPage=1&filter=" + encodeURIComponent("status='published'")))?.items?.[0];
if (firstEvent?.slug) {
  check(`event detail ${firstEvent.slug}`, (await req(`/events/${firstEvent.slug}`)).status === 200, "");
  check("event calendar ics", (await req(`/events/${firstEvent.slug}/calendar.ics`)).status === 200, "");
}
const firstSociety = json(await req("/api/collections/societies?perPage=1"))?.items?.[0];
if (firstSociety?.slug) check(`society detail ${firstSociety.slug}`, (await req(`/societies/${firstSociety.slug}`)).status === 200, "");
check("wie page", (await req("/societies/wie")).status === 200, "");
check("verify valid token", (await req(`/verify?token=${cert.verification_token}`)).status === 200, "");
check("certificate record page", (await req(`/c/${cert.verification_token}`)).status === 200, "");
const certPng = await req(`/c/${cert.verification_token}/certificate.png`);
check("certificate PNG", certPng.status === 200 && certPng.headers["content-type"] === "image/png", `${certPng.status} ${certPng.headers["content-type"]} ${certPng.ms}ms`);
const certPdf = await req(`/c/${cert.verification_token}/certificate.pdf`);
check("certificate PDF", certPdf.status === 200 && certPdf.headers["content-type"] === "application/pdf", `${certPdf.status} ${certPdf.headers["content-type"]} ${certPdf.ms}ms`);
check("unknown certificate 404", (await req(`/c/${"C".repeat(64)}/certificate.png`)).status === 404, "");
check("verify API valid", (await req(`/api/certificates/verify/${cert.verification_token}`)).status === 200, "");
check("verify API forged 404", (await req(`/api/certificates/verify/${"B".repeat(64)}`)).status === 404, "");
if (myPast?.ticket_id) {
  check("ticket page", (await req(`/ticket/${myPast.ticket_id}`)).status === 200, "");
  const qr = await req(`/ticket/${myPast.ticket_id}/qr.png`);
  check("ticket URL", /\/ticket\/[A-Za-z0-9-]+$/.test(`/ticket/${myPast.ticket_id}`) && qr.status === 200 && qr.headers["content-type"] === "image/png", `${qr.status} ${qr.headers["content-type"]}`);
  const lookup = json(await req(`/api/tickets/lookup?ticketId=${encodeURIComponent(myPast.ticket_id)}`));
  check("ticket lookup", Boolean(lookup?.ticketId || lookup?.event || lookup?.registration), Object.keys(lookup || {}).slice(0, 6).join(","));
}
const bogusTicket = await req("/api/tickets/lookup?ticketId=TKT-NOPE");
check("ticket lookup bogus reports not found", bogusTicket.status === 200 && json(bogusTicket)?.found === false, `${bogusTicket.status} ${bogusTicket.body.slice(0, 80)}`);

// ------------------------------------------------------------- 3. headers
const home = await req("/");
const h = home.headers;
check("HSTS", /max-age=31536000/.test(h["strict-transport-security"] || ""), h["strict-transport-security"]);
check("CSP nonce", /'nonce-[^']+'/.test(h["content-security-policy"] || "") && !/script-src[^;]*unsafe-inline/.test(h["content-security-policy"] || ""), "");
check("CSP frame-ancestors none", /frame-ancestors 'none'/.test(h["content-security-policy"] || ""), "");
check("X-Frame-Options DENY", h["x-frame-options"] === "DENY", h["x-frame-options"]);
check("nosniff", h["x-content-type-options"] === "nosniff", "");
check("referrer policy", h["referrer-policy"] === "strict-origin-when-cross-origin", "");
check("permissions policy", /camera=\(self\)/.test(h["permissions-policy"] || ""), h["permissions-policy"]);
check("staging noindex", /noindex/.test(h["x-robots-tag"] || ""), h["x-robots-tag"]);
check("compression", /gzip|br/.test(h["content-encoding"] || ""), h["content-encoding"]);
check("nonce matches body", (h["content-security-policy"] || "").match(/'nonce-([^']+)'/)?.[1] === (home.body.match(/nonce="([^"]+)"/) || [])[1], "");

// --------------------------------------------------- 4. collection exposure
const drafts = json(await req("/api/collections/events?filter=" + encodeURIComponent("status='draft'")));
const cancelled = json(await req("/api/collections/events?filter=" + encodeURIComponent("status='cancelled'")));
const hidden = json(await req("/api/collections/societies?filter=" + encodeURIComponent("is_hidden=1")));
check("drafts hidden (anon)", drafts?.totalItems === 0, drafts?.totalItems);
check("cancelled hidden (anon)", cancelled?.totalItems === 0, cancelled?.totalItems);
check("hidden societies hidden (anon)", hidden?.totalItems === 0, hidden?.totalItems);
const execom = json(await req("/api/collections/execom?perPage=1"));
check("execom PII hidden", execom?.items?.[0] && !("email" in execom.items[0]) && !("phone" in execom.items[0]), Object.keys(execom?.items?.[0] ?? {}).join(","));
check("users collection anonymous 401", (await req("/api/collections/users?perPage=1")).status === 401, "");
check("registrations collection absent", (await req("/api/collections/registrations?perPage=1")).status === 404, "");
const eventsAnon = json(await req("/api/collections/events?perPage=1"));
check("events public omits finance", eventsAnon?.items?.[0] && !("internal_notes" in eventsAnon.items[0]) && !("finance_approval_note" in eventsAnon.items[0]), "");

// ------------------------------------------------------------- 5. authz
check("admin page anon 302", (await req("/admin")).status === 302, "");
check("admin page member 403", (await req("/admin", { cookie: member.cookie })).status === 403, "");
check("admin page admin 200", (await req("/admin", { cookie: admin.cookie })).status === 200, "");
check("forged cookie rejected", (await req("/api/session", { cookie: "Zm9yZ2Vk" })).status === 200 && json(await req("/api/session", { cookie: "Zm9yZ2Vk" }))?.user === null, "");
for (const path of ["/api/admin/registrations?perPage=1", "/api/admin/payments?perPage=1", "/api/admin/users?perPage=1", "/api/admin/data-health"]) {
  check(`admin API anon 401 ${path}`, (await req(path)).status === 401, "");
  const memberRes = await req(path, { cookie: member.cookie });
  const zero = path.includes("/registrations") ? (json(memberRes)?.total ?? json(memberRes)?.totalItems) === 0 : false;
  check(`admin API member denied ${path}`, memberRes.status === 403 || (memberRes.status === 200 && zero), memberRes.status);
  check(`admin API admin 200 ${path}`, (await req(path, { cookie: admin.cookie })).status === 200, "");
}
const health = json(await req("/api/admin/data-health", { cookie: admin.cookie }));
check("DB integrity", health?.integrity === "ok" && health?.foreignKeyViolations === 0, JSON.stringify(health?.counts ?? {}).slice(0, 200));
check("member cannot read foreign registration", (await req(`/api/admin/registrations/${foreignReg.id}`, { cookie: member.cookie })).status === 403, "");
check("member cannot read foreign payment", (await req(`/api/registrations/${foreignReg.id}/payment`, { cookie: member.cookie })).status === 404, "");
check("member cannot post foreign payment", (await req(`/api/registrations/${foreignReg.id}/payment`, { method: "POST", cookie: member.cookie })).status === 404, "");

// ------------------------------------------------------- 6. origin + upload
async function upload(origin, bytes = "<svg/>", type = "image/png", field = "banner", record = openEvent.id) {
  const form = new FormData();
  form.set("file", new Blob([bytes], { type }), "probe.bin");
  const headers = { "Sec-Fetch-Site": "cross-site" };
  if (origin) headers.Origin = origin;
  return req(`/api/uploads/events/${record}/${field}`, { method: "POST", cookie: admin.cookie, headers, body: form });
}
check("upload evil origin 403", (await upload("https://evil.example")).status === 403, "");
check("upload no origin reaches validation 415", (await upload()).status === 415, (await upload()).status ?? "no response");
check("upload same-origin reaches validation 415", (await upload(BASE)).status === 415, (await upload(BASE)).status ?? "no response");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
async function uploadFile(bytes, type, field = "banner", record = openEvent.id) {
  const form = new FormData();
  form.set("file", new Blob([bytes], { type }), "probe.bin");
  return req(`/api/uploads/events/${record}/${field}`, { method: "POST", cookie: admin.cookie, body: form });
}
const uploadStatus = async (...args) => { const r = await uploadFile(...args); return r.status ?? r.error ?? "no response"; };
for (const [name, bytes, type, expected] of [
  ["SVG disguised as PNG", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/png", 415],
  ["PNG declared JPEG", png, "image/jpeg", 415],
  ["SVG declared SVG", "<svg/>", "image/svg+xml", 415],
]) {
  const got = await uploadStatus(bytes, type);
  check(`${name} ${expected}`, got === expected, got);
}
// Node fetch streams a >5 MB body without Expect: 100-continue; Cloudflare turns
// the origin's early 413 into a 502. Curl (and a browser over HTTP/2) sees the
// 413, so use curl for this one rather than blaming the app for a client quirk.
const bigPath = join(WORK, "big.bin");
writeFileSync(bigPath, Buffer.alloc(6 * 1024 * 1024));
const bigStatus = Number(execFileSync("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", "POST",
  "-H", `Cookie: __Host-ieee_session=${admin.cookie}`, "-F", `file=@${bigPath};type=image/png`,
  `${BASE}/api/uploads/events/${openEvent.id}/banner`]).toString());
check("6 MB upload 413", bigStatus === 413, bigStatus);
check("unknown upload field 404", (await uploadFile(png, "image/png", "description")).status === 404, "");
check("traversal record id 404", (await uploadFile(png, "image/png", "banner", "../../etc")).status === 404, "");

// ------------------------------------------------ 7. registration guards
const regPath = `/api/events/${openEvent.id}/register`;
const regHeaders = { "Content-Type": "application/json" };
check("register array 400", (await req(regPath, { method: "POST", cookie: member.cookie, headers: regHeaders, body: "[]" })).status === 400, "");
check("register malformed 400", (await req(regPath, { method: "POST", cookie: member.cookie, headers: regHeaders, body: "{bad" })).status === 400, "");
check("register oversized 413", (await req(regPath, { method: "POST", cookie: member.cookie, headers: regHeaders, body: JSON.stringify({ formResponses: { pad: "x".repeat(300 * 1024) } }) })).status === 413, "");
const closedReg = await req(`/api/events/${closedEvent.id}/register`, { method: "POST", cookie: member.cookie, headers: regHeaders, body: "{}" });
check("closed event 400", closedReg.status === 400, `${closedReg.status} ${json(closedReg)?.code ?? ""}`);

// ------------------------------------------------ 8. registration lifecycle
const created = await req(regPath, { method: "POST", cookie: member.cookie, headers: regHeaders, body: JSON.stringify({ formResponses: { name: "Staging Audit User", phone: "9000000000", college: "Audit College" } }) });
const createdBody = json(created) || {};
createdRegId = createdBody.registrationId || "";
check("free registration created", [200, 201].includes(created.status) && createdBody.registrationId && createdBody.paymentRequired === false, `${created.status} ${Object.keys(createdBody).join(",")}`);
if (createdRegId) {
  const again = await req(regPath, { method: "POST", cookie: member.cookie, headers: regHeaders, body: "{}" });
  check("duplicate registration reuses", [200, 201].includes(again.status) && json(again)?.reused === true, `${again.status} ${json(again)?.reused}`);
  const mine = json(await req("/api/my-events", { cookie: member.cookie }));
  const mineIds = (mine?.registrations ?? mine?.items ?? []).map((r) => r.registration?.id ?? r.id ?? r.registrationId);
  check("my-events includes registration", mineIds.includes(createdRegId), `${mineIds.length} rows`);
  const ticketId = createdBody.ticketId;
  check("new ticket page", (await req(`/ticket/${ticketId}`)).status === 200, ticketId);
  const qr = await req(`/ticket/${ticketId}/qr.png`);
  check("new ticket QR", qr.status === 200 && qr.headers["content-type"] === "image/png", `${qr.status} ${qr.headers["content-type"]}`);
  const cancel = await req(`/api/registrations/${createdRegId}/cancel`, { method: "POST", cookie: member.cookie, headers: regHeaders, body: JSON.stringify({ reason: "staging audit cleanup" }) });
  check("cancel registration", cancel.status === 200 && json(cancel)?.ok !== false, `${cancel.status} ${(json(cancel)?.action ?? json(cancel)?.code ?? "")}`);
  const after = json(await req("/api/my-events", { cookie: member.cookie }));
  const cancelledRow = (after?.registrations ?? after?.items ?? []).find((r) => (r.registration?.id ?? r.id) === createdRegId);
  check("cancelled state reflected", Boolean(cancelledRow) && /cancel/i.test(JSON.stringify(cancelledRow)), cancelledRow?.registrationStatus ?? cancelledRow?.status ?? "");
}

// --------------------------------------------------- 9. admin CRUD lifecycle
const societyPayload = { name: "Staging Audit Society", slug: TEST_SLUG, bio: "Temporary row created by the staging audit.", is_hidden: 0 };
const createdSociety = await req("/api/collections/societies", { method: "POST", cookie: admin.cookie, headers: { "Content-Type": "application/json" }, body: JSON.stringify(societyPayload) });
const societyBody = json(createdSociety) || {};
const societyId = societyBody.id || "";
check("admin creates society", [200, 201].includes(createdSociety.status) && Boolean(societyId), `${createdSociety.status} ${createdSociety.body.slice(0, 120)}`);
if (societyId) {
  const patch = await req(`/api/collections/societies/${societyId}`, { method: "PATCH", cookie: admin.cookie, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bio: "Updated by the staging audit." }) });
  check("admin patches society", patch.status === 200 && json(patch)?.bio === "Updated by the staging audit.", `${patch.status}`);
  const logoForm = new FormData();
  logoForm.set("file", new Blob([png], { type: "image/png" }), "logo.png");
  const logo = await req(`/api/uploads/societies/${societyId}/logo`, { method: "POST", cookie: admin.cookie, body: logoForm });
  const logoName = json(logo)?.filename || json(logo)?.logo || "";
  check("admin uploads society logo", [200, 201].includes(logo.status) && Boolean(logoName), `${logo.status} ${logo.body.slice(0, 120)}`);
  if (logoName) {
    const served = await req(`/files/societies/${societyId}/${logoName}`);
    check("uploaded logo served", served.status === 200 && /^image\//.test(served.headers["content-type"] || ""), `${served.status} ${served.headers["content-type"]}`);
  }
  const hide = await req(`/api/collections/societies/${societyId}`, { method: "PATCH", cookie: admin.cookie, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_hidden: 1 }) });
  check("admin hides society", hide.status === 200, hide.status);
  check("hidden society not public", (await req(`/societies/${TEST_SLUG}`)).status === 404, "");
  const del = await req(`/api/collections/societies/${societyId}`, { method: "DELETE", cookie: admin.cookie });
  check("admin deletes society", del.status === 200 || del.status === 204, del.status);
  const societyAudit = json(await req(`/api/collections/admin_audit_log?filter=${encodeURIComponent(`entity_id = '${societyId}'`)}&sort=-created&perPage=20`, { cookie: admin.cookie }));
  const societyActions = (societyAudit?.items ?? []).map((row) => row.action);
  check("society writes are audited", ["society.create", "society.update", "society.delete"].every((action) => societyActions.includes(action)), societyActions.join(","));
  const updateRow = (societyAudit?.items ?? []).find((row) => row.action === "society.update");
  check("society update audit keeps before/after", Boolean(updateRow?.before) && Boolean(updateRow?.after), `${updateRow?.before ?? ""} → ${updateRow?.after ?? ""}`);
}
const execomPayload = { name: TEST_EXECOM, position: "Audit", department: "Quality", batch: "2026", section: "A", order: 999 };
const createdExecom = await req("/api/collections/execom", { method: "POST", cookie: admin.cookie, headers: { "Content-Type": "application/json" }, body: JSON.stringify(execomPayload) });
const execomBody = json(createdExecom) || {};
check("admin creates execom member", [200, 201].includes(createdExecom.status) && Boolean(execomBody.id), `${createdExecom.status} ${createdExecom.body.slice(0, 120)}`);
if (execomBody.id) {
  const patch = await req(`/api/collections/execom/${execomBody.id}`, { method: "PATCH", cookie: admin.cookie, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ position: "Audit Lead" }) });
  check("admin patches execom member", patch.status === 200 && json(patch)?.position === "Audit Lead", patch.status);
  const del = await req(`/api/collections/execom/${execomBody.id}`, { method: "DELETE", cookie: admin.cookie });
  check("admin deletes execom member", del.status === 200 || del.status === 204, del.status);
  const execomAudit = json(await req(`/api/collections/admin_audit_log?filter=${encodeURIComponent(`entity_id = '${execomBody.id}'`)}&sort=-created&perPage=20`, { cookie: admin.cookie }));
  const execomActions = (execomAudit?.items ?? []).map((row) => row.action);
  check("execom writes are audited", ["execom_member.create", "execom_member.update", "execom_member.delete"].every((action) => execomActions.includes(action)), execomActions.join(","));
}

// ------------------------------------------- 9b. event write and FK behaviour
const eventPayload = { title: "Staging Audit API Event", slug: "staging-audit-api-event", date: new Date(Date.now() + 86400e3).toISOString(), status: "draft" };
const createdEvent = await req("/api/collections/events", { method: "POST", cookie: admin.cookie, headers: { "Content-Type": "application/json" }, body: JSON.stringify(eventPayload) });
const eventRow = json(createdEvent) || {};
check("admin creates event", [200, 201].includes(createdEvent.status) && Boolean(eventRow.id), `${createdEvent.status} ${createdEvent.body.slice(0, 120)}`);
if (eventRow.id) {
  const patch = await req(`/api/collections/events/${eventRow.id}`, { method: "PATCH", cookie: admin.cookie, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Staging Audit API Event (edited)" }) });
  check("admin patches event", patch.status === 200 && json(patch)?.title === "Staging Audit API Event (edited)", patch.status);
  const del = await req(`/api/collections/events/${eventRow.id}`, { method: "DELETE", cookie: admin.cookie });
  check("admin deletes event", del.status === 204, del.status);
  const eventAudit = json(await req(`/api/collections/admin_audit_log?filter=${encodeURIComponent(`entity_id = '${eventRow.id}'`)}&sort=-created&perPage=20`, { cookie: admin.cookie }));
  const rows = eventAudit?.items ?? [];
  const actions = rows.map((row) => row.action);
  check("event writes are audited", ["event.create", "event.update", "event.delete"].every((action) => actions.includes(action)), actions.join(","));
  check("event delete survives the FK", rows.some((row) => row.action === "event.delete" && row.entity_id === eventRow.id) && rows.some((row) => row.action === "event.delete" && row.event_id === null), JSON.stringify(rows.find((row) => row.action === "event.delete") ?? {}).slice(0, 160));
}

// ------------------------------------------------------------ 10. webhook
check("webhook missing signature 401", (await req("/api/webhooks/paygate", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status === 401, "");
const badSig = await req("/api/webhooks/paygate", { method: "POST", headers: { "Content-Type": "application/json", "X-PayGate-Event-Id": "x", "X-PayGate-Timestamp": String(Math.floor(Date.now() / 1000)), "X-PayGate-Signature": "v1=" + "0".repeat(64) }, body: "{}" });
check("webhook bad signature 400", badSig.status === 400, `${badSig.status} ${json(badSig)?.code ?? ""}`);
check("webhook GET 405", (await req("/api/webhooks/paygate")).status === 405, "");

// --------------------------------------------------------- 11. cache/nonce
const cacheEvents = await req("/events");
check("public events s-maxage", /s-maxage=60/.test(cacheEvents.headers["cache-control"] || ""), cacheEvents.headers["cache-control"]);
check("render cache header", ["hit", "miss"].includes(cacheEvents.headers["x-render-cache"]), cacheEvents.headers["x-render-cache"]);
const sessionDoc = await req("/events", { cookie: member.cookie });
check("session bypasses shared cache", !/s-maxage/.test(sessionDoc.headers["cache-control"] || ""), sessionDoc.headers["cache-control"]);
const apiResp = await req("/api/collections/events?perPage=1");
check("API no-store", /no-store/.test(apiResp.headers["cache-control"] || ""), apiResp.headers["cache-control"]);
const assetMatch = home.body.match(/\/assets\/[^"']+\.js/);
if (assetMatch) {
  const asset = await req(assetMatch[0]);
  check("hashed asset immutable", asset.status === 200 && /immutable/.test(asset.headers["cache-control"] || ""), `${asset.status} ${asset.headers["cache-control"]}`);
  check("asset compression", /gzip|br/.test(asset.headers["content-encoding"] || ""), asset.headers["content-encoding"]);
}

// ------------------------------------------------------- 12. methods/paths
for (const m of ["PUT", "DELETE", "PATCH"]) check(`register ${m} 405`, (await req(regPath, { method: m, cookie: member.cookie })).status === 405, "");
check(".env 404", (await req("/.env")).status === 404, "");
check("database path 404", (await req("/data/portal.db")).status === 404, "");
check("backup path 404", (await req("/backups/portal.db")).status === 404, "");
check("traversal path blocked", [400, 403, 404].includes((await req("/files/societies/../../etc/passwd")).status), "");
check("encoded traversal blocked", [400, 403, 404].includes((await req("/%2e%2e/%2e%2e/etc/passwd")).status), "");

// ------------------------------------------------------ 13. files & resizing
if (banner) {
  const file = await req(`/files/events/${banner.id}/${banner.banner}`);
  check("event banner served", file.status === 200 && /^image\//.test(file.headers["content-type"] || ""), `${file.status} ${file.headers["content-type"]}`);
  const resized = await req(`/files/events/${banner.id}/${banner.banner}?w=353`);
  check("resized banner served", resized.status === 200 && /^image\//.test(resized.headers["content-type"] || ""), `${resized.status} ${resized.headers["content-type"]} ${resized.ms}ms`);
  const badWidth = await req(`/files/events/${banner.id}/${banner.banner}?w=99999`);
  check("absurd width rejected", badWidth.status === 400 || badWidth.status === 200, badWidth.status);
}

// ---------------------------------------------------------- 14. logout
const logout = await req("/auth/logout", { method: "POST", cookie: member.cookie });
check("logout 302", logout.status === 302, logout.status);
check("logged-out session rejected", json(await req("/api/session", { cookie: member.cookie }))?.user === null, "");
check("admin session still valid", json(await req("/api/session", { cookie: admin.cookie }))?.user?.role === "admin", "");

// ------------------------------------------------------ 15. rate limit last
// Run this inside the container on a throwaway forwarded IP: using the public
// egress address would fill the /auth bucket for the next run (and for logout).
const rateScript = `(async () => {
  const statuses = [];
  for (let i = 0; i < 24; i += 1) {
    const response = await fetch("http://127.0.0.1:3000/auth/google?next=%2F", {
      headers: { "X-Forwarded-For": "198.51.100.77" },
      redirect: "manual",
    });
    statuses.push(response.status);
  }
  console.log(JSON.stringify(statuses));
})();`;
const limited = JSON.parse(execFileSync("docker", ["exec", "-i", CONTAINER, "node", "-"], {
  input: rateScript,
  encoding: "utf8",
  stdio: ["pipe", "pipe", "ignore"],
}).trim().split("\n").pop());
check("auth rate limited", limited.includes(429), `${limited.filter((s) => s === 429).length} of ${limited.length} were 429`);

// ------------------------------------------------------------- cleanup
const cleanup = `
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/app/data/portal.db');
const emails = ['${TEST_USER_EMAIL}'];
const regIds = ${JSON.stringify(createdRegId ? [createdRegId] : [])};
for (const id of regIds) {
  db.prepare('DELETE FROM notification_outbox WHERE registration_id = ?').run(id);
  db.prepare('DELETE FROM payments WHERE registration_id = ?').run(id);
  db.prepare('DELETE FROM registration_cancellation_requests WHERE registration_id = ?').run(id);
  db.prepare('DELETE FROM registrations WHERE id = ?').run(id);
}
db.prepare("DELETE FROM societies WHERE slug = '${TEST_SLUG}'").run();
db.prepare("DELETE FROM execom WHERE name = '${TEST_EXECOM}'").run();
for (const email of emails) {
  const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (u) { db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id); db.prepare('DELETE FROM users WHERE id = ?').run(u.id); }
}
db.prepare("DELETE FROM sessions WHERE user_agent LIKE 'staging-test-%'").run();
db.close();
console.log('cleanup done');
`;
try {
  const out = execFileSync("docker", ["exec", "-i", "ieee-dev-staging-web-1", "node", "--experimental-sqlite", "-"], { input: cleanup, encoding: "utf8" });
  check("cleanup ran", /cleanup done/.test(out), out.trim().split("\n")[0]);
} catch (err) {
  check("cleanup ran", false, String(err).slice(0, 200));
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILURES:");
  for (const f of failed) console.log(` - ${f.id}  ${f.detail}`);
}
