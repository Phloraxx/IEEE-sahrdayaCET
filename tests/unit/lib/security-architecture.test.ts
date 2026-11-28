import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("security architecture invariants", () => {
  it("has no runtime PocketBase client at all", () => {
    // The module used to exist and was checked for a superuser client. It is now
    // deleted, which is the stronger guarantee: there is no PocketBase client in
    // the app for a superuser credential to be added to.
    expect(existsSync(resolve("src/lib/pb.server.ts"))).toBe(false);
  });

  it("pins and verifies the PocketBase release", () => {
    const dockerfile = read("pocketbase/Dockerfile");
    expect(dockerfile).toContain("PB_VERSION=0.39.9");
    expect(dockerfile).toContain("sha256sum -c -");
    expect(dockerfile).not.toContain(":latest");
  });

  it("locks command-owned registration records against direct creation", () => {
    const migration = read("pb_migrations/202607220001_rewrite_access_rules.js");
    expect(migration).toContain("registrations.createRule = null");
  });

  it("authenticates PayGate webhooks with event id, timestamp and v1 signature", () => {
    const route = read("pb_hooks/paygate.pb.js");
    expect(route).toContain("X-PayGate-Event-Id");
    expect(route).toContain("X-PayGate-Timestamp");
    expect(route).toContain("X-PayGate-Signature");
    expect(route).toContain('$security.hs256(timestamp + "." + rawBody');
    expect(route).toContain("webhookToleranceSeconds");
    expect(route).toContain("pg.hasEventId(current, eventId)");
    expect(route).toContain('"payment.paid"');
  });

  it("rebinds provider reconciliation and webhook writes to live transactions", () => {
    const helpers = read("pb_hooks/paygate-helpers.js");
    const webhook = read("pb_hooks/paygate.pb.js");
    expect(helpers).toContain("$app.runInTransaction(function (txApp)");
    expect(helpers).toContain("var live = txApp.findRecordById");
    expect(helpers).toContain("PAYMENT_STATE_CHANGED");
    expect(webhook).toContain("$app.runInTransaction(function (txApp)");
    expect(webhook).toContain("txApp.findRecordById");
  });

  it("does not allow a retired Razorpay checkout surface through CSP or runtime files", () => {
    // The policy moved to src/lib/csp.ts so `entry.server.tsx` can mint a
    // per-request script nonce; the invariant holds wherever it lives.
    const csp = read("src/lib/csp.ts");
    expect(csp).not.toContain("razorpay.com");
    expect(csp).toContain("frame-src 'none'");
    expect(read("src/root.tsx")).not.toContain("razorpay.com");
    expect(existsSync(resolve(process.cwd(), "pb_hooks/razorpay-direct.pb.js"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "src/lib/razorpay-upi.client.ts"))).toBe(false);
  });

  it("keeps deployment environments explicitly isolated", () => {
    const compose = read("docker-compose.yml");
    expect(compose).toContain("DEPLOY_ENV: ${DEPLOY_ENV:?");
    // The web service requires the shared capability key. PocketBase is retired
    // behind a profile, and Compose interpolates services it will not start, so
    // the legacy service must NOT require a legacy-only value on the default
    // path; a deliberate legacy start goes through the override, which does.
    expect(
      compose.match(
        /CERTIFICATE_RENDER_CAPABILITY_KEY: \${CERTIFICATE_RENDER_CAPABILITY_KEY:\?CERTIFICATE_RENDER_CAPABILITY_KEY is required}/g,
      ),
    ).toHaveLength(1);
    expect(compose).not.toContain("PB_ENCRYPTION_KEY: ${PB_ENCRYPTION_KEY:?");
    // After the SQLite cutover the web service owns all app logic; it must
    // not reach back into PocketBase. PocketBase does not start by default.
    expect(compose).not.toContain("POCKETBASE_INTERNAL_URL:");
    expect(compose).toContain("- pocketbase-internal");
    expect(compose).not.toContain("POCKETBASE_INTERNAL_URL: http://pocketbase:8090");
  });

  it("retires PocketBase behind an explicit profile", () => {
    const compose = read("docker-compose.yml");
    const pocketbase = compose.slice(compose.indexOf("  pocketbase:"));
    expect(pocketbase).toContain("profiles:");
    expect(pocketbase).toContain("- legacy-pocketbase");
    // The volume key is unchanged, which is what preserves
    // <project>_pb_data and its archive names.
    expect(compose).toContain("pb_data:/pb/pb_data");
    // A deliberate legacy start requires the original encryption key.
    const override = read("docker-compose.legacy-pocketbase.yml");
    expect(override).toContain("PB_ENCRYPTION_KEY: ${PB_ENCRYPTION_KEY:?");
  });
});
