import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const fixture = {
  token: process.env.E2E_MY_EVENTS_TOKEN || "",
  eventTitle: process.env.E2E_MY_EVENTS_EVENT_TITLE || "",
  eventSlug: process.env.E2E_MY_EVENTS_EVENT_SLUG || "",
  ticketId: process.env.E2E_MY_EVENTS_TICKET_ID || "",
};

const certificateFixture = {
  token: process.env.E2E_MY_EVENTS_CERT_TOKEN || "",
  eventTitle: process.env.E2E_MY_EVENTS_CERT_EVENT_TITLE || "",
  certificateToken: process.env.E2E_MY_EVENTS_CERT_TOKEN_ID || "",
};

async function signIn(page: Page, request: APIRequestContext, token: string) {
  if (!token) throw new Error("My Events E2E requires an attendee token");
  const response = await request.post("/api/collections/users/auth-refresh", {
    headers: { Authorization: token },
  });
  expect(response.ok()).toBeTruthy();
  const auth = await response.json();
  await page.addInitScript(({ authToken, record }) => {
    localStorage.setItem("pocketbase_auth", JSON.stringify({ token: authToken, record }));
  }, { authToken: auth.token, record: auth.record });
}

test.describe("My Events attendee continuity", () => {
  test.skip(
    !fixture.token || !fixture.eventTitle || !fixture.eventSlug || !fixture.ticketId,
    "Upcoming My Events fixture is not configured",
  );

  test("upcoming attendee sees private access, ticket and calendar continuity", async ({ page, request }) => {
    await signIn(page, request, fixture.token);
    await page.goto("/my-events");

    await expect(page.getByRole("heading", { name: "Your events, in one place." })).toBeVisible();
    const card = page.getByRole("article").filter({ hasText: fixture.eventTitle });
    await expect(card).toBeVisible();
    await expect(card.getByRole("link", { name: "Join event" })).toHaveAttribute(
      "href",
      "https://meet.example.test/ci-private-room",
    );
    await expect(card.getByText(/attendee name shown on your ticket/i)).toBeVisible();
    await expect(card.getByRole("link", { name: "Ticket", exact: true })).toHaveAttribute(
      "href",
      `/ticket/${fixture.ticketId}`,
    );
  });

  test("calendar endpoint returns a stable downloadable event record", async ({ request }) => {
    const response = await request.get(`/events/${fixture.eventSlug}/calendar.ics`);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("text/calendar");
    const body = await response.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain(`SUMMARY:${fixture.eventTitle.replace(/,/g, "\\,")}`);
    expect(body).toContain(`URL:`);
  });

  test("authenticated navbar exposes My Events", async ({ page, request }) => {
    await signIn(page, request, fixture.token);
    await page.goto("/events");
    await page.locator('button[aria-haspopup="true"]').click();
    await expect(page.getByRole("link", { name: "My Events" })).toBeVisible();
  });
  test("recipient sees issued certificate from their own attendee record", async ({ page, request }) => {
    test.skip(
      !certificateFixture.token || !certificateFixture.eventTitle || !certificateFixture.certificateToken,
      "Certificate My Events fixture is not configured",
    );
    await signIn(page, request, certificateFixture.token);
    await page.goto("/my-events");

    const card = page.getByRole("article").filter({ hasText: certificateFixture.eventTitle });
    await expect(card).toBeVisible();
    await expect(card.getByRole("link", { name: "Certificate", exact: true })).toHaveAttribute(
      "href",
      `/c/${certificateFixture.certificateToken}`,
    );
  });

  test("My Events remains usable at 390px without horizontal overflow", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, request, fixture.token);
    await page.goto("/my-events");
    await expect(page.getByRole("heading", { name: "Your events, in one place." })).toBeVisible();
    await expect(page.getByText(fixture.eventTitle, { exact: true }).first()).toBeVisible();
    const geometry = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(geometry.document).toBeLessThanOrEqual(geometry.viewport + 1);
  });
});
