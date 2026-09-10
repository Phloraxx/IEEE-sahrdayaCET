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

async function createDraft(page: Page, name: string) {
  await page.getByRole("button", { name: /New template|Create first template/i }).first().click();
  await page.getByLabel("Template name").fill(name);
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText(/draft · v1/i).first()).toBeVisible();
}
test.describe("Certificate editor real interactions", () => {
  test.skip(!adminToken || !eventId, "Certificate editor fixture is not configured");

  test("persists real editor controls, drag changes, email copy, and a new version", async ({ page, request }) => {
    await authenticateAdmin(page, request);
    const browserErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });

    await page.goto(`/admin/events/${eventId}?tab=certificates`);
    await expect(page.getByRole("heading", { name: "Template Studio" })).toBeVisible();
    const name = `CI Real Editor ${Date.now()}`;
    await createDraft(page, name);

    const artwork = await sharp({
      create: { width: 1800, height: 1200, channels: 3, background: { r: 245, g: 248, b: 252 } },
    }).png().toBuffer();
    await page.locator("#cert-render-base").setInputFiles({
      name: "editor-interactions.png",
      mimeType: "image/png",
      buffer: artwork,
    });
    await expect(page.getByText("1800×1200 · unsaved artwork")).toBeVisible();

    await page.locator("#cert-name-x").fill("63");
    await page.locator("#cert-name-y").fill("41");
    await page.locator("#cert-name-width").fill("72");
    await page.locator("#cert-name-size").fill("132");
    await page.locator("#cert-name-min-size").fill("44");
    await page.locator("#cert-name-color").fill("#123456");
    await page.getByText("Name font", { exact: true }).locator("..").getByRole("combobox").click();
    await page.getByRole("option", { name: "Noto Serif", exact: true }).click();
    await page.getByText("Name alignment", { exact: true }).locator("..").getByRole("combobox").click();
    await page.getByRole("option", { name: "Left", exact: true }).click();
    await page.getByLabel("QR").check();
    await page.locator("#cert-qr-x").fill("82");
    await page.locator("#cert-qr-y").fill("79");
    await page.locator("#cert-qr-size").fill("14");
    await page.locator("#cert-id-x").fill("11");
    await page.locator("#cert-id-y").fill("89");
    await page.locator("#cert-id-size").fill("31");
    await page.locator("#cert-email-subject").fill("Certificate for {{eventTitle}} · {{name}}");
    await page.locator("#cert-email-body").fill("Hi {{firstName}},\n\nYour {{certificateType}} certificate is ready: {{verificationUrl}}\nID {{credentialId}}");
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    const namePreview = page.getByRole("button", { name: "Alexandra Joseph", exact: true });
    const before = await namePreview.boundingBox();
    expect(before).not.toBeNull();
    await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2);
    await page.mouse.down();
    await page.mouse.move(before!.x + before!.width / 2 + 36, before!.y + before!.height / 2 + 18, { steps: 4 });
    await page.mouse.up();
    const after = await namePreview.boundingBox();
    expect(after).not.toBeNull();
    expect(Math.abs(after!.x - before!.x)).toBeGreaterThan(10);

    const persistedX = await page.locator("#cert-name-x").inputValue();
    const persistedY = await page.locator("#cert-name-y").inputValue();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByText("Unsaved changes")).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText("Certificate draft saved")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.locator("#cert-name-x")).toHaveValue(persistedX);
    await expect(page.locator("#cert-name-y")).toHaveValue(persistedY);
    await expect(page.locator("#cert-name-width")).toHaveValue("72");
    await expect(page.locator("#cert-name-size")).toHaveValue("132");
    await expect(page.locator("#cert-name-min-size")).toHaveValue("44");
    await expect(page.locator("#cert-name-color")).toHaveValue("#123456");
    await expect(page.getByLabel("QR")).toBeChecked();
    await expect(page.locator("#cert-email-subject")).toHaveValue("Certificate for {{eventTitle}} · {{name}}");
    await expect(page.locator("#cert-email-body")).toContainText("Your {{certificateType}} certificate is ready");
    await expect(page.getByAltText("Certificate render base preview")).toBeVisible();

    await page.getByRole("button", { name: "Send test email", exact: true }).click();
    await expect(page.getByText(/TEST \/ NOT VALID email sent to/)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText(/published · v1/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#cert-name-x")).toBeDisabled();

    await page.getByRole("button", { name: "Edit as new version", exact: true }).click();
    await expect(page.getByText(/draft · v2/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#cert-name-x")).toBeEnabled();
    await expect(page.getByAltText("Certificate render base preview")).toBeVisible();
    await page.locator("#cert-name-size").fill("144");
    await page.locator("#cert-email-subject").fill("Updated {{eventTitle}} certificate");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByText("Unsaved changes")).toBeHidden({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByText(/draft · v2/i).first()).toBeVisible();
    await expect(page.locator("#cert-name-size")).toHaveValue("144");
    await expect(page.locator("#cert-email-subject")).toHaveValue("Updated {{eventTitle}} certificate");
    expect(browserErrors, browserErrors.join("\n")).toEqual([]);
  });
});
