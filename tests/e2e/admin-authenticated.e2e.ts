import { expect, test } from "@playwright/test";

const adminToken = process.env.E2E_ADMIN_TOKEN || "";
const eventId = process.env.E2E_EVENT_ID || "";

test.describe("Admin V2 authenticated smoke", () => {
  test.skip(!adminToken, "Admin fixture token is not configured");

  test("core operations surfaces render for an admin", async ({ page, request }) => {
    const authResponse = await request.post("/api/collections/users/auth-refresh", {
      headers: { Authorization: adminToken },
    });
    expect(authResponse.ok()).toBeTruthy();
    const auth = await authResponse.json();
    expect(auth.token).toBeTruthy();
    expect(auth.record?.role).toBe("admin");

    await page.addInitScript(({ token, record }) => {
      localStorage.setItem("pocketbase_auth", JSON.stringify({ token, record }));
    }, { token: auth.token, record: auth.record });

    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    const routes = [
      ["/admin/dashboard", /operations|dashboard|attention/i],
      ["/admin/events", /events/i],
      ["/admin/registrations", /registration/i],
      ["/admin/payments", /payment/i],
      ["/admin/check-in", /check.?in/i],
      ["/admin/data-health", /data health/i],
      ["/admin/societies", /societ/i],
      ["/admin/users", /users|access/i],
      ["/admin/execom", /execom/i],
      ["/admin/blogs", /blog|content/i],
      ...(eventId ? [[`/admin/events/${eventId}`, /overview|attendees|payments/i] as const] : []),
    ] as const;

    for (const [route, heading] of routes) {
      await page.goto(route);
      await expect(page.getByText(heading).first()).toBeVisible({ timeout: 10_000 });
    }
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });
});
