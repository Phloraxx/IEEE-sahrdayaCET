import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const adminToken = process.env.E2E_ADMIN_TOKEN || "";

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

test.describe("Certificate Registry", () => {
  test.skip(!adminToken, "Admin certificate fixture is not configured");

  test("lists issued credentials and exports the filtered ledger", async ({ page, request }) => {
    await authenticateAdmin(page, request);
    const errors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/admin/certificates");
    await expect(page.getByRole("heading", { name: "Certificate Registry" })).toBeVisible();
    await expect(page.getByPlaceholder("Name, email, Credential ID or event")).toBeVisible();
    const credential = page.getByText(/^IEEESB-\d{4}-[A-Z]{3,5}-[A-Z0-9]{10}$/).first();
    await expect(credential).toBeVisible({ timeout: 15_000 });
    const credentialId = (await credential.innerText()).trim();
    await page.getByPlaceholder("Name, email, Credential ID or event").fill(credentialId);
    await expect(page.getByText(credentialId, { exact: true }).first()).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^ieee-certificate-registry-\d{4}-\d{2}-\d{2}\.csv$/);
    const stream = await download.createReadStream();
    let csv = "";
    for await (const chunk of stream) csv += chunk.toString();
    expect(csv).toContain("Credential ID");
    expect(csv).toContain(credentialId);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("stays overflow-free and actionable on mobile", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await authenticateAdmin(page, request);
    await page.goto("/admin/certificates");
    await expect(page.getByRole("heading", { name: "Certificate Registry" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Verify/ }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Open event" }).first()).toBeVisible();
    const geometry = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      main: document.querySelector<HTMLElement>("#primary-content")?.getBoundingClientRect().width ?? 0,
    }));
    expect(geometry.document).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.main).toBeLessThanOrEqual(geometry.viewport + 1);
  });
});
