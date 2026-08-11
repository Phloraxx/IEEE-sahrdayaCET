import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

interface StalePendingHelpers {
  shouldReleaseStalePending: (
    registrationStatus: string,
    paymentStatus: string,
    paymentData: Record<string, unknown>,
    nowMs: number,
    graceSeconds: number,
  ) => boolean;
}

function loadHelpers(): StalePendingHelpers {
  const source = readFileSync(
    resolve(process.cwd(), "pb_hooks/paygate-stale-pending-helpers.js"),
    "utf8",
  );
  const module = { exports: {} as Record<string, unknown> };
  runInNewContext(source, {
    module,
    exports: module.exports,
  });
  return module.exports as unknown as StalePendingHelpers;
}

const helper = loadHelpers();
const now = Date.parse("2026-08-11T17:30:00Z");

function paymentData(expiresAt: string, providerStatus = "pending") {
  return {
    provider: "paygate",
    providerStatus,
    paymentId: "pg_stale_test",
    expiresAt,
  };
}

describe("PayGate stale pending fallback", () => {
  it("keeps a pending session during its expiry grace window", () => {
    expect(
      helper.shouldReleaseStalePending(
        "pending",
        "pending",
        paymentData("2026-08-11T17:29:30Z"),
        now,
        60,
      ),
    ).toBe(false);
  });

  it("releases a provider-pending session after expiresAt plus grace", () => {
    expect(
      helper.shouldReleaseStalePending(
        "pending",
        "pending",
        paymentData("2026-08-11T17:20:00Z"),
        now,
        60,
      ),
    ).toBe(true);
  });

  it("never targets paid, cancelled, expired, or non-PayGate state", () => {
    expect(
      helper.shouldReleaseStalePending(
        "confirmed",
        "paid",
        paymentData("2026-08-11T17:20:00Z"),
        now,
        60,
      ),
    ).toBe(false);
    expect(
      helper.shouldReleaseStalePending(
        "cancelled",
        "failed",
        paymentData("2026-08-11T17:20:00Z"),
        now,
        60,
      ),
    ).toBe(false);
    expect(
      helper.shouldReleaseStalePending(
        "pending",
        "pending",
        paymentData("2026-08-11T17:20:00Z", "expired"),
        now,
        60,
      ),
    ).toBe(false);
    expect(
      helper.shouldReleaseStalePending(
        "pending",
        "pending",
        {
          provider: "other",
          providerStatus: "pending",
          expiresAt: "2026-08-11T17:20:00Z",
        },
        now,
        60,
      ),
    ).toBe(false);
  });

  it("fails closed when provider expiry is missing or malformed", () => {
    expect(
      helper.shouldReleaseStalePending(
        "pending",
        "pending",
        paymentData(""),
        now,
        60,
      ),
    ).toBe(false);
    expect(
      helper.shouldReleaseStalePending(
        "pending",
        "pending",
        paymentData("not-a-date"),
        now,
        60,
      ),
    ).toBe(false);
  });
});
