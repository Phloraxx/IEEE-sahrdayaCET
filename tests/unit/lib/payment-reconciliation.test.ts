import { describe, expect, it } from "vitest";
import {
  LOCAL_PAYMENT_STATUS_POLL_MS,
  providerReconcileDelayMs,
  providerRetryAfterMs,
} from "@/lib/payment-reconciliation";

describe("payment reconciliation pacing", () => {
  it("keeps local status reads cheap while backing provider checks off", () => {
    expect(LOCAL_PAYMENT_STATUS_POLL_MS).toBe(4_000);
    expect(
      [0, 1, 2, 3, 4, 99].map((attempt) =>
        providerReconcileDelayMs(attempt, 0),
      ),
    ).toEqual([8_000, 15_000, 30_000, 45_000, 60_000, 60_000]);
  });

  it("adds bounded positive jitter to spread simultaneous provider checks", () => {
    expect(providerReconcileDelayMs(0, 1)).toBe(9_600);
    expect(providerReconcileDelayMs(4, 1)).toBe(72_000);
    expect(providerReconcileDelayMs(0, -1)).toBe(8_000);
    expect(providerReconcileDelayMs(0, 2)).toBe(9_600);
  });

  it("honors a bounded provider retry-after hint", () => {
    expect(
      providerRetryAfterMs({ response: { retryAfterMs: 10_000 } }, 30_000),
    ).toBe(10_000);
    expect(
      providerRetryAfterMs({ response: { retryAfterMs: 900_000 } }, 30_000),
    ).toBe(120_000);
    expect(providerRetryAfterMs({}, 30_000)).toBe(30_000);
  });
});
