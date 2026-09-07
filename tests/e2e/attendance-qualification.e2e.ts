import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const adminToken = process.env.E2E_ADMIN_TOKEN || "";
const eventId = process.env.E2E_ATTENDANCE_QUALIFICATION_EVENT_ID || "";

async function signIn(page: Page, request: APIRequestContext) {
  const response = await request.post("/api/collections/users/auth-refresh", {
    headers: { Authorization: adminToken },
  });
  expect(response.ok()).toBeTruthy();
  const auth = await response.json();
  await page.addInitScript(({ token, record }) => {
    localStorage.setItem("pocketbase_auth", JSON.stringify({ token, record }));
  }, { token: auth.token, record: auth.record });
}

test.describe("Attendance qualification closeout", () => {
  test.skip(!adminToken || !eventId, "Attendance qualification fixture is not configured");

  test("shows locked qualification consistently across attendance, certificates and closeout", async ({ page, request }) => {
    await signIn(page, request);

    await page.goto(`/admin/events/${eventId}?tab=attendance`);
    await expect(page.getByText("Certificate attendance locked · v2", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add session" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reopen", exact: true })).toBeVisible();

    await page.goto(`/admin/events/${eventId}?tab=certificates`);
    await expect(page.getByText("Attendance qualification is locked at version 2 with 1 required session.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Attendance qualified/ })).toBeEnabled();

    await page.goto(`/admin/events/${eventId}?tab=closeout`);
    await expect(page.getByText("Locked · v2", { exact: true })).toBeVisible();
    await expect(page.getByText("2 certificate records issued", { exact: true })).toBeVisible();
    await expect(page.getByText("2 issued records", { exact: true })).toBeVisible();
    await expect(page.getByText(/never block archive/i)).toBeVisible();
  });
});
