import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("mail delivery architecture", () => {
  it("routes current notification mail through the central safety guard", () => {
    const notifications = read("pb_hooks/notification-helpers.js");
    expect(notifications).toContain('require(__hooks + "/mail-delivery.js").prepare');
    expect(notifications).toContain("to: [{ address: delivery.recipient }]");
  });

  it("treats policy blocks as terminal outbox failures", () => {
    const worker = read("pb_hooks/registration-notifications.pb.js");
    expect(worker).toContain("err.mailDeliveryPermanent === true");
    expect(worker).toContain('record.set("attempts", 8)');
  });

  it("passes mail safety configuration only to PocketBase", () => {
    const compose = read("docker-compose.yml");
    expect(compose).toContain("DEPLOY_ENV: ${DEPLOY_ENV:?DEPLOY_ENV is required}");
    expect(compose).toContain("MAIL_DELIVERY_MODE: ${MAIL_DELIVERY_MODE:-}");
    expect(compose).toContain("MAIL_ALLOWLIST: ${MAIL_ALLOWLIST:-}");
    expect(compose).toContain("MAIL_REDIRECT_TO: ${MAIL_REDIRECT_TO:-}");
  });
});
