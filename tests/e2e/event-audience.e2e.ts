import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type Fixture = {
  token: string;
  record: Record<string, unknown>;
  eventId: string;
  eventTitle: string;
  programmeCode: string;
  semester: string;
};

const fixturePath = process.env.E2E_AUDIENCE_FIXTURE || "/tmp/event-audience-e2e.json";
const fixture: Fixture | null = existsSync(fixturePath)
  ? JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture
  : null;

async function signIn(page: Page, input: Fixture) {
  await page.addInitScript(({ token, record }) => {
    localStorage.setItem("pocketbase_auth", JSON.stringify({ token, record }));
  }, input);
}
test.describe("event audience registration UX", () => {
  test.skip(!fixture, "Audience fixture is not configured");

  test("shows only eligible academic options for a restricted event", async ({ page }) => {
    await signIn(page, fixture!);
    await page.goto(`/register/${fixture!.eventId}`);

    await expect(page.getByText(fixture!.eventTitle)).toBeVisible();
    const programme = page.getByLabel("Programme / Branch *");
    const semester = page.getByLabel("Semester *");
    await expect(programme).toBeVisible();
    await expect(semester).toBeVisible();
    await expect(programme.locator("option")).toHaveCount(2);
    await expect(semester.locator("option")).toHaveCount(2);
    await expect(programme).toContainText("Electrical & Electronics Engineering");
    await expect(semester).toContainText("S6 · Year 3");

    await programme.selectOption(fixture!.programmeCode);
    await semester.selectOption(fixture!.semester);
    await expect(programme).toHaveValue("EEE");
    await expect(semester).toHaveValue("S6");
  });
});
