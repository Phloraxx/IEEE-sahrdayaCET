import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

type Fixture = {
  token: string;
  record: Record<string, unknown>;
  eventId: string;
  paidCode: string;
  paidAmount: number;
  freeCode: string;
};

const fixturePath = process.env.E2E_COUPON_FIXTURE || "/tmp/coupon-redemption-e2e.json";
const fixture: Fixture | null = existsSync(fixturePath)
  ? JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture
  : null;

test.describe("coupon redemption", () => {
  test.skip(!fixture, "Coupon redemption fixture is not configured");

  test("previews a discount and completes a 100%-off registration", async ({ page }) => {
    await page.addInitScript(({ token, record }) => {
      localStorage.setItem("pocketbase_auth", JSON.stringify({ token, record }));
    }, { token: fixture!.token, record: fixture!.record });

    await page.goto(`/register/${fixture!.eventId}`);
    await expect(page.getByText("Have a coupon?")).toBeVisible();    await page.getByPlaceholder("Your full name").fill("Coupon Browser");
    await page.getByPlaceholder("+91 98765 43210").fill("9876543210");
    await page.getByPlaceholder("Your college or institution").fill("CI College");

    const couponInput = page.getByPlaceholder("COUPON CODE");
    await couponInput.fill(fixture!.paidCode);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(`${fixture!.paidCode} · 20% off`)).toBeVisible();
    await expect(page.getByRole("button", { name: `Continue to payment · ₹${fixture!.paidAmount}` })).toBeVisible();

    await couponInput.fill(fixture!.freeCode);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(`${fixture!.freeCode} · 100% off`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm free registration" })).toBeVisible();

    await page.getByText("I confirm that the information above is accurate and agree to the event terms.").click();
    await page.getByRole("button", { name: "Confirm free registration" }).click();
    await expect(page).toHaveURL(/\/ticket\//);
  });
});