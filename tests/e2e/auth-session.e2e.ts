import { expect, test, type Page } from "@playwright/test";

function fakeToken(seconds = 3600) {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds, type: "auth" }),
  ).toString("base64url");
  return `fake.${payload}.signature`;
}

const cachedRecord = {
  id: "cached-user",
  collectionId: "users",
  collectionName: "users",
  email: "cached@example.test",
  name: "Cached User",
  role: "admin",
};

async function seedCachedSession(page: Page) {
  const token = fakeToken();
  await page.addInitScript(({ token, record }) => {
    localStorage.setItem("pocketbase_auth", JSON.stringify({ token, record }));
  }, { token, record: cachedRecord });
  return token;
}

test.describe("validated authentication state", () => {
  test("does not expose a stale cached user when auth refresh is rejected", async ({ page }) => {
    await seedCachedSession(page);
    let workspaceRequests = 0;
    await page.route("**/api/collections/users/auth-refresh", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ code: 401, message: "Invalid authentication token.", data: {} }),
      }),
    );
    await page.route("**/api/workspace/me", (route) => {
      workspaceRequests += 1;
      return route.fulfill({ status: 500, body: "must not run" });
    });

    await page.goto("/pricing");
    await expect(page.getByRole("button", { name: "SIGN IN" })).toBeVisible();
    await expect(page.getByText("Cached User", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "My Events" })).toHaveCount(0);
    expect(workspaceRequests).toBe(0);
  });

  test("shows account and workspace actions only after refresh validates the session", async ({ page }) => {
    const token = await seedCachedSession(page);
    await page.route("**/api/collections/users/auth-refresh", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token, record: cachedRecord }),
      }),
    );
    await page.route("**/api/workspace/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          hasWorkspace: true,
          legacyRole: "admin",
          capabilities: ["workspace.view", "events.view"],
          branchCapabilities: ["workspace.view", "events.view"],
          assignments: [],
        }),
      }),
    );

    await page.goto("/pricing");
    await expect(page.getByRole("button", { name: "Cached" })).toBeVisible();
    await page.getByRole("button", { name: "Cached" }).click();
    await expect(page.getByText("Cached User", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "My Events" })).toBeVisible();
    await expect(page.getByRole("link", { name: "IEEE Workspace" })).toBeVisible();
    await expect(page.getByRole("button", { name: "SIGN IN" })).toHaveCount(0);
  });

  test("uses an app-owned landing page for PocketBase OAuth popup redirects", async ({ page }) => {
    const response = await page.goto("/_/#/auth/oauth2-redirect-failure");
    expect(response?.status()).toBe(200);
    await expect(page.locator("[data-oauth-popup-result]")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign-in did not complete." })).toBeVisible();

    await page.goto("/_/");
    await expect(page.getByText("No PocketBase administration interface is exposed here.")).toBeVisible();
  });
});
