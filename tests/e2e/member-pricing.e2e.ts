import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

type Fixture = {
  token: string;
  record: Record<string, unknown>;
  eventId: string;
  memberDiscountPercent: number;
  memberAmount: number;
  memberId: string;
  tieCode: string;
  betterCouponCode: string;
  couponAmount: number;
};

const fixturePath = process.env.E2E_PRICING_FIXTURE || "/tmp/member-pricing-e2e.json";
const fixture: Fixture | null = existsSync(fixturePath)
  ? JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture
  : null;

test.describe("IEEE member pricing", () => {
  test.skip(!fixture, "Member pricing fixture is not configured");

  test("shows the better server-calculated member or coupon price", async ({ page }) => {
    await page.addInitScript(({ token, record }) => {
      localStorage.setItem("pocketbase_auth", JSON.stringify({ token, record }));
    }, { token: fixture!.token, record: fixture!.record });

    await page.goto(`/register/${fixture!.eventId}`);
    await page.getByPlaceholder("Your full name").fill("Pricing Browser");
    await page.getByPlaceholder("+91 98765 43210").fill("9876543210");
    await page.getByPlaceholder("Your college or institution").fill("CI College");

    await page.getByText("I am an IEEE member").click();
    await expect(page.getByText(`IEEE members receive ${fixture!.memberDiscountPercent}% off after providing a Membership ID.`)).toBeVisible();
    await page.getByPlaceholder("Membership ID").fill(fixture!.memberId);
    await expect(page.getByText(`IEEE member price applied · ₹${fixture!.memberAmount}`)).toBeVisible();
    await expect(page.getByRole("button", { name: `Continue to payment · ₹${fixture!.memberAmount}` })).toBeVisible();

    const couponInput = page.getByPlaceholder("COUPON CODE");
    await couponInput.fill(fixture!.tieCode);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(`${fixture!.tieCode} · IEEE member price applied`)).toBeVisible();
    await expect(page.getByRole("button", { name: `Continue to payment · ₹${fixture!.memberAmount}` })).toBeVisible();

    await couponInput.fill(fixture!.betterCouponCode);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(`${fixture!.betterCouponCode} · 30% off`)).toBeVisible();
    await expect(page.getByRole("button", { name: `Continue to payment · ₹${fixture!.couponAmount}` })).toBeVisible();
  });
});
