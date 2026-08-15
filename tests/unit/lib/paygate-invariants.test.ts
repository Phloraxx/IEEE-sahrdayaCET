import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

interface ProviderPayment {
  id: string;
  status: string;
  requestedAmountPaise: number;
  payableAmountPaise: number;
  payableAmount?: string;
  expiresAt?: string;
  paidAt?: string | null;
  upiUri?: string;
  externalId?: string;
}

interface PayGateHelpers {
  externalIdForRegistration: (id: string) => string;
  registrationIdFromExternalId: (id: string) => string;
  idempotencyKeyForRegistration: (id: string) => string;
  expectedRequestedPaise: (amount: number) => number;
  validateProviderPayment: (
    raw: ProviderPayment,
    amount: number,
    options?: Record<string, unknown>,
  ) => { ok: boolean; error?: string; payment?: ProviderPayment };
  resolveProviderTransition: (input: Record<string, unknown>) => {
    action: string;
    error?: string;
  };
  shouldReleasePendingRegistration: (
    registration: FakeRegistration,
    nowMs: number,
    graceSeconds: number,
  ) => boolean;
}

class FakeRegistration {
  constructor(
    private readonly values: Record<string, unknown>,
  ) {}

  getString(key: string): string {
    return typeof this.values[key] === "string" ? String(this.values[key]) : "";
  }

  get(key: string): unknown {
    return this.values[key];
  }
}

function loadHelpers(): PayGateHelpers {
  const source = readFileSync(
    resolve(process.cwd(), "pb_hooks/paygate-helpers.js"),
    "utf8",
  );
  const module = { exports: {} as Record<string, unknown> };
  runInNewContext(source, {
    module,
    exports: module.exports,
    console,
    $os: { getenv: () => "" },
  });
  return module.exports as unknown as PayGateHelpers;
}

const pg = loadHelpers();
const validPayment: ProviderPayment = {
  id: "payment_123",
  status: "pending",
  requestedAmountPaise: 10000,
  payableAmountPaise: 10037,
  payableAmount: "100.37",
  expiresAt: "2026-08-11T16:30:00Z",
  paidAt: null,
  upiUri: "upi://pay?pa=example%40upi&am=100.37&cu=INR",
  externalId: "ieee-sahrdaya:local:registration:reg_123",
};

describe("PayGate registration identity", () => {
  it("round-trips the external registration identity", () => {
    expect(pg.externalIdForRegistration("reg_123")).toBe(
      "ieee-sahrdaya:local:registration:reg_123",
    );
    expect(
      pg.registrationIdFromExternalId("ieee-sahrdaya:local:registration:reg_123"),
    ).toBe("reg_123");
    expect(pg.registrationIdFromExternalId("other-app:reg_123")).toBe("");
    expect(
      pg.registrationIdFromExternalId("ieee-sahrdaya:production:registration:reg_123"),
    ).toBe("");
  });

  it("uses one deterministic idempotency key per registration", () => {
    expect(pg.idempotencyKeyForRegistration("reg_123")).toBe(
      "ieee-paygate-local-reg_123",
    );
    expect(pg.idempotencyKeyForRegistration("reg_123")).toBe(
      pg.idempotencyKeyForRegistration("reg_123"),
    );
  });
});

describe("PayGate monetary validation", () => {
  it("converts only positive whole rupees to paise", () => {
    expect(pg.expectedRequestedPaise(100)).toBe(10000);
    expect(pg.expectedRequestedPaise(0)).toBe(0);
    expect(pg.expectedRequestedPaise(10.5)).toBe(0);
  });

  it("accepts the exact requested amount plus a 1..99 paise fingerprint", () => {
    const result = pg.validateProviderPayment(validPayment, 100, {
      requireUpiUri: true,
      externalId: "ieee-sahrdaya:local:registration:reg_123",
    });
    expect(result.ok).toBe(true);
    expect(result.payment?.payableAmountPaise).toBe(10037);
  });

  it("rejects a provider requested-amount mismatch", () => {
    const result = pg.validateProviderPayment(
      { ...validPayment, requestedAmountPaise: 9900, payableAmountPaise: 9937 },
      100,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/requested amount/i);
  });

  it("rejects .00 and fingerprints outside the 99-paise pool", () => {
    expect(
      pg.validateProviderPayment(
        { ...validPayment, payableAmountPaise: 10000 },
        100,
      ).ok,
    ).toBe(false);
    expect(
      pg.validateProviderPayment(
        { ...validPayment, payableAmountPaise: 10100 },
        100,
      ).ok,
    ).toBe(false);
  });

  it("rejects a different persisted payment identity", () => {
    const result = pg.validateProviderPayment(validPayment, 100, {
      paymentId: "another_payment",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/identity mismatch/i);
  });
});

describe("PayGate lifecycle mapping", () => {
  const base = {
    registrationStatus: "pending",
    paymentStatus: "pending",
    amountMatches: true,
    paymentIdMatches: true,
  };

  it("confirms an active registration only for payment.paid", () => {
    expect(
      pg.resolveProviderTransition({ ...base, eventType: "payment.paid" }),
    ).toEqual({ action: "confirm" });
  });

  it("never resurrects a cancelled registration after a paid callback", () => {
    expect(
      pg.resolveProviderTransition({
        ...base,
        eventType: "payment.paid",
        registrationStatus: "cancelled",
      }),
    ).toEqual({ action: "manual_review" });
  });

  it("holds expired payments for the IEEE grace period", () => {
    expect(
      pg.resolveProviderTransition({ ...base, eventType: "payment.expired" }),
    ).toEqual({ action: "mark_expired" });
  });

  it("cancels provider-cancelled payments and reviews genuinely late ones", () => {
    expect(
      pg.resolveProviderTransition({ ...base, eventType: "payment.cancelled" }),
    ).toEqual({ action: "cancel" });
    expect(
      pg.resolveProviderTransition({ ...base, eventType: "payment.late" }),
    ).toEqual({ action: "manual_review" });
  });

  it("fails closed on amount or payment identity mismatch", () => {
    expect(
      pg.resolveProviderTransition({
        ...base,
        eventType: "payment.paid",
        amountMatches: false,
      }).action,
    ).toBe("error");
    expect(
      pg.resolveProviderTransition({
        ...base,
        eventType: "payment.paid",
        paymentIdMatches: false,
      }).action,
    ).toBe("error");
  });
});

describe("PayGate pending-seat cleanup", () => {
  const now = Date.parse("2026-08-11T16:20:00Z");

  it("releases an uninitialized PayGate seat only after grace", () => {
    const fresh = new FakeRegistration({
      registrationStatus: "pending",
      paymentStatus: "pending",
      registrationDate: "2026-08-11T16:19:30Z",
      paymentData: { provider: "paygate", providerStatus: "not_initialized" },
    });
    const stale = new FakeRegistration({
      registrationStatus: "pending",
      paymentStatus: "pending",
      registrationDate: "2026-08-11T16:00:00Z",
      paymentData: { provider: "paygate", providerStatus: "not_initialized" },
    });
    expect(pg.shouldReleasePendingRegistration(fresh, now, 60)).toBe(false);
    expect(pg.shouldReleasePendingRegistration(stale, now, 60)).toBe(true);
  });

  it("releases expired payment seats only after expiry plus grace", () => {
    const beforeGrace = new FakeRegistration({
      registrationStatus: "pending",
      paymentStatus: "pending",
      paymentData: {
        provider: "paygate",
        providerStatus: "expired",
        expiresAt: "2026-08-11T16:19:30Z",
      },
    });
    const afterGrace = new FakeRegistration({
      registrationStatus: "pending",
      paymentStatus: "pending",
      paymentData: {
        provider: "paygate",
        providerStatus: "expired",
        expiresAt: "2026-08-11T16:10:00Z",
      },
    });
    expect(pg.shouldReleasePendingRegistration(beforeGrace, now, 60)).toBe(false);
    expect(pg.shouldReleasePendingRegistration(afterGrace, now, 60)).toBe(true);
  });
});
