import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "pb_hooks/mail-delivery.js"), "utf8");
const sandbox = { module: { exports: {} as Record<string, unknown> }, exports: {} };
vm.runInNewContext(source, sandbox, { filename: "mail-delivery.js" });
const mailDelivery = sandbox.module.exports as {
  normalizedMode: (mode: string, env: string) => string;
  resolveDelivery: (options: Record<string, string>) => {
    allowed: boolean;
    mode: string;
    reason?: string;
    recipient?: string;
    originalRecipient?: string;
  };
};

describe("mail delivery safety", () => {
  it("keeps production live by default for backwards compatibility", () => {
    expect(mailDelivery.normalizedMode("", "production")).toBe("live");
    expect(mailDelivery.resolveDelivery({ deployEnv: "production", mode: "", recipient: "person@example.com" })).toMatchObject({
      allowed: true,
      mode: "live",
      recipient: "person@example.com",
    });
  });

  it("fails closed outside production when no mode is configured", () => {
    expect(mailDelivery.resolveDelivery({ deployEnv: "staging", mode: "", recipient: "person@example.com" })).toMatchObject({
      allowed: false,
      mode: "disabled",
      reason: "delivery_disabled",
    });
  });

  it("does not allow live mode on staging", () => {
    expect(mailDelivery.resolveDelivery({ deployEnv: "staging", mode: "live", recipient: "person@example.com" })).toMatchObject({
      allowed: false,
      mode: "live",
      reason: "live_not_allowed_outside_production",
    });
  });

  it("allows only explicit addresses in allowlist mode", () => {
    expect(mailDelivery.resolveDelivery({
      deployEnv: "staging",
      mode: "allowlist",
      allowlist: "Test@One.Example, second@example.com",
      recipient: "test@one.example",
    })).toMatchObject({ allowed: true, mode: "allowlist", recipient: "test@one.example" });

    expect(mailDelivery.resolveDelivery({
      deployEnv: "staging",
      mode: "allowlist",
      allowlist: "test@one.example",
      recipient: "other@example.com",
    })).toMatchObject({ allowed: false, reason: "recipient_not_allowlisted" });
  });

  it("redirects only when an explicit redirect target exists", () => {
    expect(mailDelivery.resolveDelivery({
      deployEnv: "staging",
      mode: "redirect",
      redirectTo: "qa@example.com",
      recipient: "participant@example.com",
    })).toMatchObject({
      allowed: true,
      recipient: "qa@example.com",
      originalRecipient: "participant@example.com",
    });
  });

  it("blocks redirect mode without a target and invalid modes", () => {
    expect(mailDelivery.resolveDelivery({
      deployEnv: "staging",
      mode: "redirect",
      recipient: "participant@example.com",
    })).toMatchObject({ allowed: false, reason: "redirect_target_missing" });

    expect(mailDelivery.resolveDelivery({
      deployEnv: "staging",
      mode: "anything-else",
      recipient: "participant@example.com",
    })).toMatchObject({ allowed: false, mode: "disabled", reason: "invalid_mode" });
  });
  it("checks environment safety before claiming notification outbox work", () => {
    const outbox = readFileSync(resolve(process.cwd(), "pb_hooks/registration-notifications.pb.js"), "utf8");
    expect(source).toContain("currentResolution: currentResolution");
    const safetyCheck = outbox.indexOf("mailSafety.currentResolution");
    const claim = outbox.indexOf('live.set("status", "sending")');
    expect(safetyCheck).toBeGreaterThan(-1);
    expect(outbox).toContain("if (!safety.allowed) continue");
    expect(safetyCheck).toBeLessThan(claim);
  });

});
