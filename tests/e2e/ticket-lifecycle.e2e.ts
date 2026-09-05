import { expect, test } from "@playwright/test";

const cancelledTicketId = process.env.E2E_CANCELLED_TICKET_ID || "";

test.describe("ticket lifecycle", () => {
  test.skip(!cancelledTicketId, "Cancelled ticket fixture is not configured");

  test("cancelled ticket remains historical but cannot present a check-in QR", async ({ page, request }) => {
    await page.goto(`/ticket/${encodeURIComponent(cancelledTicketId)}`);

    const panel = page.getByTestId("ticket-check-in-panel");
    await expect(panel).toHaveAttribute("data-check-in-state", "cancelled");
    await expect(page.getByText("Ticket / Cancelled", { exact: true })).toBeVisible();
    await expect(page.getByText("This ticket was cancelled.", { exact: true })).toBeVisible();
    await expect(page.getByText("Show this at check-in.", { exact: true })).toHaveCount(0);
    await expect(page.getByAltText("Event ticket QR code")).toHaveCount(0);
    await expect(page.getByText("Loading attendee-only links…")).toHaveCount(0);

    const qr = await request.get(`/ticket/${encodeURIComponent(cancelledTicketId)}/qr.png`);
    expect(qr.status()).toBe(404);
    expect(qr.headers()["cache-control"]).toBe("no-store");
  });
});
