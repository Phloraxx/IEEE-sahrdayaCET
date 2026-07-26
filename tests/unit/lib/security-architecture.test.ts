import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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

  it("locks transactional records against direct creation", () => {
    const migration = read("pb_migrations/202607220001_rewrite_access_rules.js");
    expect(migration).toContain("fifaBets.createRule = null");
    expect(migration).toContain("registrations.createRule = null");
  });

  it("fails closed when the payment webhook integration is not configured", () => {
    const webhook = read("pb_hooks/webhook.pb.js");
    expect(webhook).toContain('e.json(503, { error: "Webhook not configured" })');
    expect(webhook).toContain('e.json(401, { error: "Invalid webhook secret" })');
  });

  it("keeps deployment environments explicitly isolated", () => {
    const compose = read("docker-compose.yml");
    const server = read("src/lib/pb.server.ts");
    expect(compose).toContain("DEPLOY_ENV: ${DEPLOY_ENV:?");
    expect(compose).toContain("POCKETBASE_INTERNAL_URL: http://pocketbase:8090");
    expect(server).not.toContain("https://db.");
  });
});
