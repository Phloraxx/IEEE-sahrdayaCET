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
      create: { width: 2000, height: 1400, channels: 3, background: { r: 247, g: 251, b: 255 } },
    }).png().toBuffer();
    await page.locator("#cert-render-base").setInputFiles({ name: "ci-certificate-artwork.png", mimeType: "image/png", buffer: renderBase });
    await expect(page.getByLabel("QR")).not.toBeChecked();
    await expect(page.getByText("2000×1400 · unsaved artwork")).toBeVisible();
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Unsaved changes")).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText("2000×1400").first()).toBeVisible();

    await expect(page.getByAltText("Certificate render base preview")).toBeVisible();
    await expect.poll(async () => page.getByAltText("Certificate render base preview").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2000);
    const stressNames = page.getByLabel("Certificate preview stress names");
    await expect(stressNames.getByRole("button", { name: "Very long" })).toBeVisible();
    await stressNames.getByRole("button", { name: "Very long" }).click();
    await expect(page.getByRole("button", { name: "Mohammed Abdul Rahman Kizhakkedath", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText(/published · v1/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
    await expect(page.getByText("Published artwork is read-only")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recipients → Review → Issue", exact: true })).toBeVisible();
    await expect(page.getByText("No automatic email")).toBeVisible();
    await page.getByRole("button", { name: /Confirmed/ }).click();
    await page.getByRole("button", { name: "Review recipients", exact: true }).click();
    await expect(page.getByText("Review the exact audience")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Issue 1 certificate/ })).toBeDisabled();
    await expect(page.getByText("Member", { exact: true }).first()).toBeVisible();
    await page.getByRole("checkbox", { name: /I confirm these are the/i }).check();
    await page.getByRole("button", { name: /Issue 1 certificate/ }).click();
    await expect(page.getByText("No email has been sent yet.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Send & delivery", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Queue 1 email/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Queue 1 email/ }).click();
    await expect(page.getByText(/Delivery in progress|Dispatch complete/)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Edit as new version", exact: true }).click();
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
