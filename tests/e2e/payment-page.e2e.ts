import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const fixture = {
  token: process.env.E2E_PAYMENT_TOKEN || "",
  registrationId: process.env.E2E_PAYMENT_REGISTRATION_ID || "",
  eventTitle: process.env.E2E_PAYMENT_EVENT_TITLE || "",
  payable: process.env.E2E_PAYMENT_PAYABLE || "",
};

async function signIn(page: Page, request: APIRequestContext) {
  if (!fixture.token) throw new Error("Payment E2E requires E2E_PAYMENT_TOKEN");
  const response = await request.post("/api/collections/users/auth-refresh", {
    headers: { Authorization: fixture.token },
  });
  expect(response.ok()).toBeTruthy();
  const auth = await response.json();
  await page.addInitScript(({ token, record }) => {
    localStorage.setItem("pocketbase_auth", JSON.stringify({ token, record }));
  }, { token: auth.token, record: auth.record });
}

test.describe("pending PayGate checkout", () => {
  test.skip(
    !fixture.token || !fixture.registrationId || !fixture.eventTitle || !fixture.payable,
    "Payment page fixture is not configured",
  );

  test("renders the stored exact PayGate v4 UPI session", async ({ page, request }) => {
    await signIn(page, request);
    await page.goto(`/payment/${fixture.registrationId}`);

    await expect(page.getByText("Registration / Payment")).toBeVisible();
    await expect(page.getByRole("heading", { name: fixture.eventTitle })).toBeVisible();
    await expect(page.getByText("UPI payment", { exact: true })).toBeVisible();
    await expect(page.getByText(`₹${fixture.payable}`, { exact: true })).toBeVisible();
    await expect(page.getByText(/Pay the exact amount shown/)).toBeVisible();
    await expect(page.getByRole("img", { name: "UPI payment QR code" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Check payment" })).toBeVisible();
  });
});
