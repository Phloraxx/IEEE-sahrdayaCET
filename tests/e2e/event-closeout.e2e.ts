import { expect, test } from "@playwright/test";

const adminToken = process.env.E2E_ADMIN_TOKEN || "";
const eventId = process.env.E2E_CLOSEOUT_EVENT_ID || "";

async function signIn(page: any, request: any) {
  const authResponse = await request.post("/api/collections/users/auth-refresh", {
    headers: { Authorization: adminToken },
  });
  expect(authResponse.ok()).toBeTruthy();
  const auth = await authResponse.json();
  await page.addInitScript(({ token, record }: any) => {
    localStorage.setItem("pocketbase_auth", JSON.stringify({ token, record }));
  }, { token: auth.token, record: auth.record });
}

test.describe("Event closeout workspace", () => {
  test.skip(!adminToken || !eventId, "Closeout fixture is not configured");

  test("shows server blockers and withholds archive until reconciliation", async ({ page, request }) => {
    await signIn(page, request);
    await page.goto(`/admin/events/${eventId}?tab=closeout`);
    await expect(page.getByText("Closeout readiness")).toBeVisible();
    await expect(page.getByText("Finish reconciliation before archive")).toBeVisible();
    await expect(page.getByText("Pending registrations still need a final decision")).toBeVisible();
    await expect(page.getByRole("button", { name: "Archive settled event" })).toHaveCount(0);
    await page.getByRole("button", { name: "Open attendees" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/events/${eventId}\\?tab=attendees`));
  });

  test("closeout remains usable at 390px", async ({ page, request }) => {
    await signIn(page, request);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/admin/events/${eventId}?tab=closeout`);
    await expect(page.getByText("Closeout readiness")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});
