import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type Persona = { token: string; record: Record<string, unknown> };
type Fixtures = { PERSONAS: { branch: Persona }; SOCIETY_ID: string };
const fixturePath = process.env.E2E_WORKSPACE_FIXTURE || "/tmp/community-workspace-e2e.json";
const fixtures: Fixtures | null = existsSync(fixturePath)
  ? JSON.parse(readFileSync(fixturePath, "utf8")) as Fixtures
  : null;

async function signIn(page: Page, persona: Persona) {
  await page.addInitScript(({ token, record }) => {
    localStorage.setItem("pocketbase_auth", JSON.stringify({ token, record }));
  }, persona);
}

test.describe("event setup UX", () => {
  test.skip(!fixtures, "Workspace persona fixtures are not configured");
  test("creates a draft and configures registration and fees", async ({ page }) => {
    await signIn(page, fixtures!.PERSONAS.branch);
    await page.goto(`/admin/events/new?society=${fixtures!.SOCIETY_ID}`);
    await expect(page.getByText("Give the event its essentials.")).toBeVisible();
    await page.locator("#draft-title").fill("Event Setup UX Test");
    await page.locator("#draft-date").fill("2026-09-10T14:00");
    await page.locator("#draft-venue").fill("UX Lab");
    await page.getByRole("button", { name: "Create draft & continue" }).click();
    await expect(page).toHaveURL(/\/admin\/events\/[^/]+\/edit\?section=details/);
    await expect(page.getByRole("heading", { name: "Event setup" })).toBeVisible();

    const match = page.url().match(/\/admin\/events\/([^/]+)\/edit/);
    expect(match?.[1]).toBeTruthy();
    const eventId = match![1];
    await page.screenshot({ path: "/tmp/event-setup-details-desktop.png", fullPage: true });

    await page.goto(`/admin/events/${eventId}/edit?section=registration`);
    await expect(page.getByRole("heading", { name: "How will people join?" })).toBeVisible();
    await page.locator("#capacity").fill("80");
    await page.getByRole("button", { name: "Add first question" }).click();
    await page.getByPlaceholder("e.g. Dietary preference").fill("Laptop operating system");
    await page.screenshot({ path: "/tmp/event-setup-registration-desktop.png", fullPage: true });
    await page.goto(`/admin/events/${eventId}/edit?section=fees`);
    await page.getByRole("button", { name: "Paid event" }).click();
    await page.locator("#price").fill("150");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("All changes saved")).toBeVisible();
    await page.reload();
    await expect(page.locator("#price")).toHaveValue("150");
    await page.screenshot({ path: "/tmp/event-setup-fees-desktop.png", fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/admin/events/${eventId}/edit?section=details`);
    const setupNav = page.getByRole("navigation", { name: "Event setup sections" }).first();
    await expect(setupNav.getByRole("button", { name: "Registration" })).toBeVisible();
    await setupNav.getByRole("button", { name: "Review" }).click();
    await expect(page.getByRole("heading", { name: "See the setup before you submit it" })).toBeVisible();
    await page.screenshot({ path: "/tmp/event-setup-review-mobile.png", fullPage: true });
  });
});
