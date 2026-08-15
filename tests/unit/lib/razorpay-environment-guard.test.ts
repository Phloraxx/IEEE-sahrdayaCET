import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type Helpers = {
  getConfig: () => { keyId: string; keySecret: string; apiBaseUrl: string };
  apiConfigured: (config: Record<string, unknown>) => boolean;
};

function load(env: Record<string, string>): Helpers {
  const source = readFileSync(
    resolve(process.cwd(), "pb_hooks/razorpay-direct-helpers.js"),
    "utf8",
  );
  const module = { exports: {} as Record<string, unknown> };
  runInNewContext(source, {
    module,
    exports: module.exports,
    console,
    $os: { getenv: (name: string) => env[name] || "" },
  });
  return module.exports as unknown as Helpers;
}
describe("Razorpay production environment guard", () => {
  it("rejects test keys on the production domain", () => {
    const helpers = load({
      SITE_URL: "https://ieeesahrdaya.com",
      RAZORPAY_KEY_ID: "rzp_test_example",
      RAZORPAY_KEY_SECRET: "secret",
    });
    expect(helpers.apiConfigured(helpers.getConfig())).toBe(false);
  });

  it("allows test keys away from production for staging/CI", () => {
    const helpers = load({
      SITE_URL: "https://staging.ieeesahrdaya.com",
      RAZORPAY_KEY_ID: "rzp_test_example",
      RAZORPAY_KEY_SECRET: "secret",
    });
    expect(helpers.apiConfigured(helpers.getConfig())).toBe(true);
  });

  it("allows live keys on production", () => {
    const helpers = load({
      SITE_URL: "https://ieeesahrdaya.com",
      RAZORPAY_KEY_ID: "rzp_live_example",
      RAZORPAY_KEY_SECRET: "secret",
    });
    expect(helpers.apiConfigured(helpers.getConfig())).toBe(true);
  });
});
