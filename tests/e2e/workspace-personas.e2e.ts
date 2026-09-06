import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type Persona = { token: string; record: Record<string, unknown> };
type Fixtures = {
  PERSONAS: { branch: Persona; checkin: Persona; chair: Persona; finance: Persona; content: Persona; registration?: Persona };
  EVENT_ID: string;
  SOCIETY_ID: string;
};

const fixturePath = process.env.E2E_WORKSPACE_FIXTURE || "/tmp/community-workspace-e2e.json";
const fixtures: Fixtures | null = existsSync(fixturePath)
  ? JSON.parse(readFileSync(fixturePath, "utf8")) as Fixtures
  : null;

async function signIn(page: Page, persona: Persona) {
  await page.addInitScript(({ token, record }) => {
    localStorage.setItem("pocketbase_auth", JSON.stringify({ token, record }));
  }, persona);
}
const checkInUrl = /\/admin\/check-in(?:\?[^#]+)?$/;

test.describe("IEEE Workspace role personas", () => {
  test.skip(!fixtures, "Workspace persona fixtures are not configured");

  test("check-in staff see only the scanner surface and cannot deep-link elsewhere", async ({ page }) => {
    await signIn(page, fixtures!.PERSONAS.checkin);
    await page.goto("/admin");
    await expect(page).toHaveURL(checkInUrl);
    await expect(page.getByRole("heading", { name: "Attendance console" })).toBeVisible();
    const nav = page.getByRole("complementary", { name: "IEEE Workspace navigation" });
    await expect(nav.getByRole("link", { name: "Check-in" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Registrations" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Payments" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Access & Roles" })).toHaveCount(0);

    await page.goto("/admin/registrations");
    await expect(page).toHaveURL(checkInUrl);
    await page.goto("/admin/access");
    await expect(page).toHaveURL(checkInUrl);
  });

  test("society chair can operate its society without platform administration", async ({ page }) => {
    await signIn(page, fixtures!.PERSONAS.chair);
    await page.goto("/admin/access");
    await expect(page.getByRole("heading", { name: "Access & Roles" })).toBeVisible();
    const nav = page.getByRole("complementary", { name: "IEEE Workspace navigation" });
    await expect(nav.getByRole("link", { name: "Events" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Access & Roles" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Users" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Execom" })).toHaveCount(0);
  });
  test("event finance is scoped to its event and cannot open the branch payment desk", async ({ page }) => {
    await signIn(page, fixtures!.PERSONAS.finance);
    await page.goto(`/admin/events/${fixtures!.EVENT_ID}`);
    await expect(page.getByText(/payment|finance/i).first()).toBeVisible({ timeout: 10_000 });
    const nav = page.getByRole("complementary", { name: "IEEE Workspace navigation" });
    await expect(nav.getByRole("link", { name: "Payments" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Registrations" })).toHaveCount(0);

    await page.goto("/admin/registrations");
    await expect(page).toHaveURL(/\/admin\/events$/);
    await page.goto("/admin/payments");
    await expect(page).toHaveURL(/\/admin\/events$/);
  });

  test("registration desk normalizes forbidden payment tabs and keeps attendee operations usable", async ({ page }) => {
    test.skip(!fixtures?.PERSONAS.registration, "Registration persona fixture is not configured");
    await signIn(page, fixtures!.PERSONAS.registration!);

    await page.goto(`/admin/events/${fixtures!.EVENT_ID}?tab=payments`);
    await expect(page).toHaveURL(new RegExp(`/admin/events/${fixtures!.EVENT_ID}$`));
    await expect(page.getByRole("button", { name: "Payments" })).toHaveCount(0);
    await expect(page.getByText("Recorded collected", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Active seats", { exact: true }).first()).toBeVisible();

    await page.goto(`/admin/events/${fixtures!.EVENT_ID}?tab=attendees`);
    await expect(page).toHaveURL(new RegExp(`/admin/events/${fixtures!.EVENT_ID}\\?tab=attendees$`));
    await expect(page.getByText("Attendee register", { exact: true })).toBeVisible();
    await expect(page.getByText("All registration states", { exact: true })).toBeVisible();
    await expect(page.getByText("All payment states", { exact: true })).toHaveCount(0);
  });

  test("event content lands in blogs and cannot open registration operations", async ({ page }) => {
    await signIn(page, fixtures!.PERSONAS.content);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/blogs$/);
    await expect(page.getByRole("heading", { name: "Manage Blogs" })).toBeVisible();
    await page.goto("/admin/registrations");
    await expect(page).toHaveURL(/\/admin\/blogs$/);
  });
  test("standalone community profile route is not exposed", async ({ page }) => {
    await signIn(page, fixtures!.PERSONAS.checkin);
    const response = await page.goto("/profile");
    expect(response?.status()).toBe(404);
  });

  test("mobile check-in workspace exposes the permitted drawer only", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, fixtures!.PERSONAS.checkin);
    await page.goto("/admin/check-in");
    await expect(page.getByRole("heading", { name: "Attendance console" })).toBeVisible();
    await page.getByRole("button", { name: "Open sidebar" }).click();
    const nav = page.getByRole("complementary", { name: "IEEE Workspace navigation" });
    await expect(nav.getByRole("link", { name: "Check-in" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Registrations" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Payments" })).toHaveCount(0);
  });
});