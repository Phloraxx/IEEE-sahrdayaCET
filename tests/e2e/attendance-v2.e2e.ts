import { expect, test, type Page, type APIRequestContext } from "@playwright/test";

const ADMIN_TOKEN = process.env.E2E_ADMIN_TOKEN || "";
const fixture = {
  eventId: process.env.E2E_ATTENDANCE_EVENT_ID || "",
  ticketId: process.env.E2E_ATTENDANCE_TICKET_ID || "",
  attendeeName: process.env.E2E_ATTENDANCE_ATTENDEE_NAME || "",
};

async function signInAdmin(page: Page, request: APIRequestContext) {
  if (!ADMIN_TOKEN) throw new Error("Attendance E2E requires E2E_ADMIN_TOKEN");
  const response = await request.post("/api/collections/users/auth-refresh", {
    headers: { Authorization: ADMIN_TOKEN },
  });
  expect(response.ok()).toBeTruthy();
  const auth = await response.json();
  await page.addInitScript(({ token, record }) => {
    localStorage.setItem("pocketbase_auth", JSON.stringify({ token, record }));
  }, { token: auth.token, record: auth.record });
}

test.describe("Attendance V2 browser lifecycle", () => {
  test.skip(
    !ADMIN_TOKEN || !fixture.eventId || !fixture.ticketId || !fixture.attendeeName,
    "Attendance browser fixtures are not configured",
  );
  test.describe.configure({ mode: "serial" });

  let scannerHref = "";

  test("organizer turns a sessionless event into session attendance", async ({ page, request }) => {
    await signInAdmin(page, request);
    await page.goto(`/admin/events/${fixture.eventId}?tab=attendance`);
    await expect(page.getByText("Legacy single check-in is active", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Add session" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Add attendance session" })).toBeVisible();
    await dialog.getByLabel("Session name *").fill("E2E Core Session");
    await dialog.getByRole("button", { name: "Save session" }).click();
    await expect(page.getByText("Session attendance", { exact: true })).toBeVisible();
    await expect(page.getByText("E2E Core Session", { exact: true })).toBeVisible();
    const scannerLink = page.getByRole("link", { name: "Open scanner" });
    await expect(scannerLink).toBeVisible();
    scannerHref = await scannerLink.getAttribute("href") || "";
    expect(scannerHref).toContain(`/admin/check-in?event=${fixture.eventId}&session=`);

    await page.getByRole("button", { name: "Attendees" }).click();
    await expect(page.getByText(fixture.attendeeName, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Check in", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Undo check-in", exact: true })).toHaveCount(0);
  });

  test("session scanner records, corrects, restores and rejects duplicates", async ({ page, request }) => {
    await signInAdmin(page, request);
    expect(scannerHref).not.toBe("");
    await page.goto(scannerHref);
    await expect(page.getByRole("heading", { name: "Attendance console" })).toBeVisible();
    await expect(page.getByText("E2E Core Session", { exact: true }).first()).toBeVisible();
    const ticketInput = page.getByPlaceholder("TKT-…");
    await ticketInput.fill(fixture.ticketId);
    await page.getByRole("button", { name: "Record", exact: true }).click();
    await expect(page.getByRole("status").getByText("Attendance recorded", { exact: true })).toBeVisible();
    await expect(page.getByText(fixture.attendeeName, { exact: true }).last()).toBeVisible();
    const presentCard = page.getByText("Present", { exact: true }).locator("..");
    await expect(presentCard.getByText("1", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Correct", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Correct", exact: true }).click();
    let correctionDialog = page.getByRole("dialog");
    await expect(correctionDialog.getByRole("heading", { name: "Correct attendance" })).toBeVisible();
    const append = correctionDialog.getByRole("button", { name: "Append correction" });
    await expect(append).toBeDisabled();
    await correctionDialog.getByLabel("Reason *").fill("E2E accidental desk scan");
    await append.click();
    await expect(page.getByRole("status").getByText("Attendance corrected", { exact: true })).toBeVisible();
    await expect(presentCard.getByText("0", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    correctionDialog = page.getByRole("dialog");
    await expect(correctionDialog.getByRole("heading", { name: "Restore attendance" })).toBeVisible();
    await correctionDialog.getByLabel("Reason *").fill("E2E verified attendee was present");
    await correctionDialog.getByRole("button", { name: "Append correction" }).click();
    await expect(page.getByRole("status").getByText("Attendance restored", { exact: true })).toBeVisible();
    await expect(presentCard.getByText("1", { exact: true })).toBeVisible();

    await ticketInput.fill(fixture.ticketId);
    await page.getByRole("button", { name: "Record", exact: true }).click();
    await expect(page.getByRole("status").getByText("Already recorded", { exact: true })).toBeVisible();
  });

  test("session scanner remains usable without horizontal overflow on mobile", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAdmin(page, request);
    await page.goto(scannerHref);
    await expect(page.getByRole("heading", { name: "Attendance console" })).toBeVisible();
    await expect(page.getByPlaceholder("TKT-…")).toBeVisible();
    const geometry = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(geometry.document).toBeLessThanOrEqual(geometry.viewport + 1);
  });
});
