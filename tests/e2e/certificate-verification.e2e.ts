import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

type CertificateRecord = {
  verificationToken: string;
  recipientNameSnapshot: string;
  recipientEmailSnapshot?: string;
  eventTitleSnapshot: string;
  credentialId: string;
  status: "active" | "revoked" | "superseded";
};

const PB_BASE_URL = (process.env.PB_BASE_URL || "http://127.0.0.1:8090").replace(/\/+$/, "");
const SUPER_EMAIL = process.env.PB_SUPERUSER_EMAIL || "";
const SUPER_PASS = process.env.PB_SUPERUSER_PASSWORD || "";

async function pbJson(path: string, init: RequestInit = {}) {
  const response = await fetch(`${PB_BASE_URL}${path}`, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(`PocketBase ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

async function fixtureByStatus(status: CertificateRecord["status"]): Promise<CertificateRecord> {
  if (!SUPER_EMAIL || !SUPER_PASS) throw new Error("Certificate verification E2E requires CI superuser fixture credentials");
  const auth = await pbJson("/api/collections/_superusers/auth-with-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: SUPER_EMAIL, password: SUPER_PASS }),
  });
  const filter = encodeURIComponent(`status = "${status}"`);
  const list = await pbJson(`/api/collections/certificates/records?perPage=1&filter=${filter}`, {
    headers: { Authorization: auth.token },
  });
  if (!list.items?.length) throw new Error(`Missing ${status} certificate fixture`);
  return list.items[0] as CertificateRecord;
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

test("certificate verification uses the public-site design shell on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/verify");
  await expect(page.getByRole("heading", { name: "Verify a certificate." })).toBeVisible();
  await expect(page.getByText("01", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("PUBLIC REGISTRY", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  await expect(page.getByText("IEEE", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("SAHRDAYA", { exact: true }).last()).toBeVisible();
  const geometry = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("public certificate verification exposes the safe active credential projection", async ({ page }) => {
  const certificate = await fixtureByStatus("active");
  const response = await page.goto(`/c/${certificate.verificationToken}`);
  expect(response?.status()).toBe(200);
  expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  await expect(page.getByRole("heading", { name: "Verified credential" })).toBeVisible();
  await expect(page.getByText("ACTIVE", { exact: true })).toBeVisible();
  await expect(page.getByText(certificate.recipientNameSnapshot, { exact: true })).toBeVisible();
  await expect(page.getByText(certificate.eventTitleSnapshot, { exact: true })).toBeVisible();
  await expect(page.getByText(certificate.credentialId, { exact: true })).toBeVisible();
  if (certificate.recipientEmailSnapshot) {
    await expect(page.getByText(certificate.recipientEmailSnapshot, { exact: true })).toHaveCount(0);
  }
});

test("printed Credential IDs verify without a QR code", async ({ page }) => {
  const certificate = await fixtureByStatus("active");
  const response = await page.goto(`/verify?id=${encodeURIComponent(certificate.credentialId)}`);
  expect(response?.status()).toBe(200);
  expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  await expect(page.getByRole("heading", { name: "Verified credential" })).toBeVisible();
  await expect(page.getByText(certificate.recipientNameSnapshot, { exact: true })).toBeVisible();
  await expect(page.getByText(certificate.credentialId, { exact: true })).toBeVisible();
  if (certificate.recipientEmailSnapshot) await expect(page.getByText(certificate.recipientEmailSnapshot, { exact: true })).toHaveCount(0);
});

test("revoked and superseded credentials stay publicly verifiable", async ({ page }) => {
  const revoked = await fixtureByStatus("revoked");
  let response = await page.goto(`/c/${revoked.verificationToken}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Revoked credential" })).toBeVisible();
  await expect(page.getByText("REVOKED", { exact: true })).toBeVisible();

  const superseded = await fixtureByStatus("superseded");
  response = await page.goto(`/c/${superseded.verificationToken}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Superseded credential" })).toBeVisible();
  await expect(page.getByText("SUPERSEDED", { exact: true })).toBeVisible();
});

test("invalid tokens render an explicit invalid state without credential data", async ({ page }) => {
  const response = await page.goto(`/c/${"0".repeat(48)}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Invalid credential" })).toBeVisible();
  await expect(page.getByText("INVALID", { exact: true })).toBeVisible();
  await expect(page.getByText("No public record", { exact: true })).toBeVisible();
});

test("PNG and PDF resources are deterministic, correctly typed and never cached", async ({ request }) => {
  const certificate = await fixtureByStatus("active");
  const pngUrl = `/c/${certificate.verificationToken}/certificate.png`;
  const firstPng = await request.get(pngUrl);
  const secondPng = await request.get(pngUrl);
  expect(firstPng.status()).toBe(200);
  expect(firstPng.headers()["content-type"]).toContain("image/png");
  expect(firstPng.headers()["cache-control"]).toBe("no-store");
  expect(firstPng.headers()["x-content-type-options"]).toBe("nosniff");
  expect(firstPng.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(firstPng.headers()["content-disposition"]).toContain(`${certificate.credentialId}.png`);
  const pngA = await firstPng.body();
  const pngB = await secondPng.body();
  expect(pngA.subarray(0, 8)).toEqual(Buffer.from("89504e470d0a1a0a", "hex"));
  expect(sha256(pngA)).toBe(sha256(pngB));

  const pdfUrl = `/c/${certificate.verificationToken}/certificate.pdf`;
  const firstPdf = await request.get(pdfUrl);
  const secondPdf = await request.get(pdfUrl);
  expect(firstPdf.status()).toBe(200);
  expect(firstPdf.headers()["content-type"]).toContain("application/pdf");
  expect(firstPdf.headers()["cache-control"]).toBe("no-store");
  expect(firstPdf.headers()["x-content-type-options"]).toBe("nosniff");
  expect(firstPdf.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(firstPdf.headers()["content-disposition"]).toContain(`${certificate.credentialId}.pdf`);
  const pdfA = await firstPdf.body();
  const pdfB = await secondPdf.body();
  expect(pdfA.subarray(0, 5).toString()).toBe("%PDF-");
  expect(sha256(pdfA)).toBe(sha256(pdfB));

  const missing = await request.get(`/c/${"0".repeat(48)}/certificate.png`);
  expect(missing.status()).toBe(404);
});
