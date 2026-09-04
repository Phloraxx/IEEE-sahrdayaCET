import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("security architecture invariants", () => {
  it("has no runtime PocketBase superuser client", () => {
    const source = read("src/lib/pb.server.ts");
    expect(source).not.toContain("createAdminPB");
    expect(source).not.toContain("POCKETBASE_SUPERUSER");
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

  it("does not allow a retired Razorpay checkout surface through CSP or runtime files", () => {
    const root = read("src/root.tsx");
    expect(root).not.toContain("razorpay.com");
    expect(root).toContain("frame-src 'none'");
    expect(existsSync(resolve(process.cwd(), "pb_hooks/razorpay-direct.pb.js"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "src/lib/razorpay-upi.client.ts"))).toBe(false);
  });

  it("keeps deployment environments explicitly isolated", () => {
    const compose = read("docker-compose.yml");
    const server = read("src/lib/pb.server.ts");
    expect(compose).toContain("DEPLOY_ENV: ${DEPLOY_ENV:?");
    expect(compose.match(/CERTIFICATE_RENDER_CAPABILITY_KEY: \${CERTIFICATE_RENDER_CAPABILITY_KEY:\?CERTIFICATE_RENDER_CAPABILITY_KEY is required}/g)).toHaveLength(2);
    expect(compose).toContain("POCKETBASE_INTERNAL_URL: http://pocketbase-internal:8090");
    expect(compose).toContain("- pocketbase-internal");
    expect(compose).not.toContain("POCKETBASE_INTERNAL_URL: http://pocketbase:8090");
    expect(server).not.toContain("https://db.");
  });
});
