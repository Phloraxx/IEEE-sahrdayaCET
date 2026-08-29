import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import sharp from "sharp";

const adminToken = process.env.E2E_ADMIN_TOKEN || "";
const eventId = process.env.E2E_EVENT_ID || "";

async function authenticateAdmin(page: Page, request: APIRequestContext) {
  const authResponse = await request.post("/api/collections/users/auth-refresh", {
    headers: { Authorization: adminToken },
  });
  expect(authResponse.ok()).toBeTruthy();
  const auth = await authResponse.json();
  await page.addInitScript(({ token, record }: { token: string; record: unknown }) => {
    localStorage.setItem("pocketbase_auth", JSON.stringify({ token, record }));
  }, { token: auth.token, record: auth.record });
}

test.describe("Certificate Template Studio", () => {
  test.skip(!adminToken || !eventId, "Admin certificate fixture is not configured");

  test("creates, saves, publishes, and versions an event certificate template", async ({ page, request }) => {
    await authenticateAdmin(page, request);
    const errors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

    const templateName = `CI Participation ${Date.now()}`;
    await page.goto(`/admin/events/${eventId}?tab=certificates`);
    await expect(page.getByRole("heading", { name: "Template Studio" })).toBeVisible();

    await page.getByRole("button", { name: /New template|Create first template/i }).first().click();
    await page.getByLabel("Template name").fill(templateName);
    await page.getByRole("button", { name: /Create draft/i }).click();
    await expect(page.getByRole("heading", { name: templateName })).toBeVisible();
    await expect(page.getByText(/draft · v1/i).first()).toBeVisible();

    const renderBase = await sharp({
      create: { width: 2400, height: 1350, channels: 3, background: { r: 247, g: 251, b: 255 } },
    }).png().toBuffer();
    const signature = await sharp({
      create: { width: 800, height: 240, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
    }).png().toBuffer();

    await page.locator("#cert-render-base").setInputFiles({ name: "ci-render-base.png", mimeType: "image/png", buffer: renderBase });
    await page.locator("#cert-source-background").setInputFiles({ name: "ci-background.png", mimeType: "image/png", buffer: renderBase });
    await page.locator("#cert-source-signatures").setInputFiles({ name: "ci-signature.png", mimeType: "image/png", buffer: signature });
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Unsaved changes")).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText("2400×1350").first()).toBeVisible();

    await expect(page.getByAltText("Certificate render base preview")).toBeVisible();
    await expect.poll(async () => page.getByAltText("Certificate render base preview").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2400);

    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText(/published · v1/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
    await expect(page.getByText("Published artwork is read-only")).toBeVisible();

    await page.getByRole("button", { name: "New version" }).click();
    await expect(page.getByText(/draft · v2/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Save draft" })).toBeVisible();
    await expect(page.getByAltText("Certificate render base preview")).toBeVisible();

    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("keeps the certificate studio usable on mobile", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await authenticateAdmin(page, request);
    await page.goto(`/admin/events/${eventId}?tab=certificates`);
    await expect(page.getByRole("heading", { name: "Template Studio" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
