import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

interface ProviderPayment {
  apiVersion?: string;
  id: string;
  status: string;
  requestedAmountPaise: number;
  payableAmountPaise: number;
  payableAmount?: string;
  expiresAt?: string;
  graceUntil?: string;
  paidAt?: string | null;
  upiUri?: string;
  transactionNote?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
}

interface PayGateHelpers {
  getConfig: () => Record<string, unknown>;
  idempotencyKeyForRegistration: (id: string) => string;
  expectedRequestedPaise: (amount: number) => number;
  normalizeProviderPayment: (raw: Record<string, unknown>, options?: Record<string, unknown>) => ProviderPayment | null;
  registrationIdFromProviderPayment: (raw: Record<string, unknown>, options?: Record<string, unknown>) => string;
  updateProviderData: (registration: FakeRegistration, payment: Record<string, unknown>, extra: Record<string, unknown>) => Record<string, unknown>;
  validateProviderPayment: (raw: Record<string, unknown>, amount: number, options?: Record<string, unknown>) => { ok: boolean; error?: string; payment?: ProviderPayment };
  resolveProviderTransition: (input: Record<string, unknown>) => { action: string; error?: string };
  shouldReleasePendingRegistration: (registration: FakeRegistration, nowMs: number, graceSeconds: number) => boolean;
}

class FakeRegistration {
  constructor(private readonly values: Record<string, unknown>) {}
  getString(key: string): string { return typeof this.values[key] === "string" ? String(this.values[key]) : ""; }
  get(key: string): unknown { return this.values[key]; }
}

function loadHelpers(env: Record<string, string> = {}): PayGateHelpers {
  const source = readFileSync(resolve(process.cwd(), "pb_hooks/paygate-helpers.js"), "utf8");
  const module = { exports: {} as Record<string, unknown> };
  runInNewContext(source, { module, exports: module.exports, console, $os: { getenv: (key: string) => env[key] || "" } });
  return module.exports as unknown as PayGateHelpers;
}

const pg = loadHelpers();
const validV4Payment = {
  id: "payment_v4_123",
  object: "payment",
  name: "CI Attendee",
  external_id: "event_123",
  metadata: { registration_id: "reg_123", environment: "local" },
  status: "pending",
  requested_amount: "100.00",
  payable_amount: "101.37",
  adjustment: "1.37",
  upi_uri: "upi://pay?am=101.37&cu=INR&pa=example%40upi&tn=PayGate%20payment_v4_123",
  transaction_note: "PayGate payment_v4_123",
  expires_at: "2026-08-11T16:30:00Z",
  grace_until: "2026-08-11T16:35:00Z",
  paid_at: null,
};

const validationOptions = {
  requireUpiUri: true,
  externalId: "event_123",
  registrationId: "reg_123",
  environment: "local",
};

describe("PayGate v4 contract", () => {
  it("has no runtime API-version switch", () => {
    expect(loadHelpers().getConfig()).not.toHaveProperty("apiVersion");
    expect(loadHelpers({ PAYGATE_API_VERSION: "v3" }).getConfig()).not.toHaveProperty("apiVersion");
  });

  it("caps webhook freshness tolerance to a bounded operational window", () => {
    expect(loadHelpers({ PAYGATE_WEBHOOK_TOLERANCE_SECONDS: "86400" }).getConfig().webhookToleranceSeconds).toBe(900);
  });

  it("allows HTTP only for local CI endpoints and requires HTTPS elsewhere", () => {
    expect(loadHelpers({ PAYGATE_URL: "http://host.docker.internal:18081" }).getConfig().url).toBe("http://host.docker.internal:18081");
    expect(loadHelpers({ PAYGATE_URL: "http://paygate.example.test" }).getConfig().url).toBe("");
    expect(loadHelpers({ PAYGATE_URL: "https://paygate.example.test/" }).getConfig().url).toBe("https://paygate.example.test");
  });

  it("rejects the retired v3 camelCase payment shape", () => {
    expect(pg.normalizeProviderPayment({
      id: "payment_v3", status: "pending", requestedAmountPaise: 10000,
      payableAmountPaise: 10037, upiUri: "upi://pay?pa=x&am=100.37",
    })).toBeNull();
  });

  it("normalizes only the v4 snake_case payment object", () => {
    const payment = pg.normalizeProviderPayment(validV4Payment);
    expect(payment).toMatchObject({
      apiVersion: "v4", id: "payment_v4_123", requestedAmountPaise: 10000,
      payableAmountPaise: 10137, externalId: "event_123",
      transactionNote: "PayGate payment_v4_123",
    });
    expect(payment?.upiUri).toBe(validV4Payment.upi_uri);
  });
  it("accepts the documented objectless webhook shape only with webhook opt-in", () => {
    const webhookPayment = { ...validV4Payment } as Record<string, unknown>;
    delete webhookPayment.object;
    expect(pg.normalizeProviderPayment(webhookPayment)).toBeNull();
    expect(pg.registrationIdFromProviderPayment(webhookPayment, { allowWebhookShape: true })).toBe("reg_123");
    const validated = pg.validateProviderPayment(webhookPayment, 100, {
      ...validationOptions,
      allowWebhookShape: true,
    });
    expect(validated.ok).toBe(true);
    const retiredCamelCase = {
      ...webhookPayment,
      requestedAmountPaise: 10000,
      payableAmountPaise: 10137,
    };
    expect(pg.registrationIdFromProviderPayment(retiredCamelCase, { allowWebhookShape: true })).toBe("");
  });

  it("cleans retired v3 routing markers when v4 state is persisted", () => {
    const registration = new FakeRegistration({ paymentData: {
      provider: "paygate", paygateApiVersion: "v3", eventPaymentProvider: "kotak", paymentAccount: "kotak",
    }});
    const payment = pg.normalizeProviderPayment(validV4Payment) as unknown as Record<string, unknown>;
    const next = pg.updateProviderData(registration, payment, {});
    expect(next.provider).toBe("paygate");
    expect(next).not.toHaveProperty("paygateApiVersion");
    expect(next).not.toHaveProperty("eventPaymentProvider");
    expect(next).not.toHaveProperty("paymentAccount");
    expect(next.transactionNote).toBe("PayGate payment_v4_123");
  });

  it("clears explicitly empty payment instructions instead of retaining stale QR data", () => {
    const registration = new FakeRegistration({ paymentData: {
      provider: "paygate", upiUri: "upi://pay?am=100.37&cu=INR&pa=stale%40upi", transactionNote: "stale note",
    }});
    const raw = { ...validV4Payment, upi_uri: "", transaction_note: "" };
    const payment = pg.normalizeProviderPayment(raw) as unknown as Record<string, unknown>;
    const next = pg.updateProviderData(registration, payment, {});
    expect(next.upiUri).toBe("");
    expect(next.transactionNote).toBe("");
  });

  it("preserves payment instructions only when a partial webhook omits those fields", () => {
    const registration = new FakeRegistration({ paymentData: {
      provider: "paygate", upiUri: validV4Payment.upi_uri, transactionNote: validV4Payment.transaction_note,
    }});
    const raw = { ...validV4Payment } as Record<string, unknown>;
    delete raw.upi_uri;
    delete raw.transaction_note;
    const payment = pg.normalizeProviderPayment(raw) as unknown as Record<string, unknown>;
    const next = pg.updateProviderData(registration, payment, {});
    expect(next.upiUri).toBe(validV4Payment.upi_uri);
    expect(next.transactionNote).toBe(validV4Payment.transaction_note);
  });
});

describe("PayGate registration identity", () => {
  it("correlates payments only through environment-scoped v4 metadata", () => {
    expect(pg.registrationIdFromProviderPayment(validV4Payment)).toBe("reg_123");
    expect(pg.registrationIdFromProviderPayment({ ...validV4Payment, metadata: { registration_id: "reg_123", environment: "production" } })).toBe("");
    expect(pg.registrationIdFromProviderPayment({ ...validV4Payment, metadata: { environment: "local" } })).toBe("");
  });

  it("uses one deterministic idempotency key per registration and environment", () => {
    expect(pg.idempotencyKeyForRegistration("reg_123")).toBe("ieee-paygate-local-reg_123");
    expect(pg.idempotencyKeyForRegistration("reg_123")).toBe(pg.idempotencyKeyForRegistration("reg_123"));
  });
});

describe("PayGate monetary validation", () => {
  it("converts only positive whole rupees to paise", () => {
    expect(pg.expectedRequestedPaise(100)).toBe(10000);
    expect(pg.expectedRequestedPaise(0)).toBe(0);
    expect(pg.expectedRequestedPaise(10.5)).toBe(0);
  });

  it("accepts v4 fingerprints in the current bucket and overflow bucket", () => {
    const normal = pg.validateProviderPayment({
      ...validV4Payment,
      payable_amount: "100.37",
      upi_uri: "upi://pay?am=100.37&cu=INR&pa=example%40upi&tn=PayGate%20payment_v4_123",
    }, 100, validationOptions);
    expect(normal.ok).toBe(true);
    expect(normal.payment?.payableAmountPaise).toBe(10037);
    const overflow = pg.validateProviderPayment(validV4Payment, 100, validationOptions);
    expect(overflow.ok).toBe(true);
    expect(overflow.payment?.payableAmountPaise).toBe(10137);
  });

  it("rejects a provider requested-amount mismatch", () => {
    const result = pg.validateProviderPayment({ ...validV4Payment, requested_amount: "99.00", payable_amount: "99.37" }, 100, validationOptions);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/requested amount/i);
  });

  it("rejects UPI instructions that disagree with the validated payment", () => {
    const wrongAmount = pg.validateProviderPayment({
      ...validV4Payment,
      upi_uri: "upi://pay?am=100.37&cu=INR&pa=example%40upi&tn=PayGate%20payment_v4_123",
    }, 100, validationOptions);
    expect(wrongAmount.ok).toBe(false);
    expect(wrongAmount.error).toMatch(/UPI amount/i);

    const wrongNote = pg.validateProviderPayment({
      ...validV4Payment,
      upi_uri: "upi://pay?am=101.37&cu=INR&pa=example%40upi&tn=PayGate%20another_payment",
    }, 100, validationOptions);
    expect(wrongNote.ok).toBe(false);
    expect(wrongNote.error).toMatch(/transaction reference/i);

    const wrongCurrency = pg.validateProviderPayment({
      ...validV4Payment,
      upi_uri: "upi://pay?am=101.37&cu=USD&pa=example%40upi&tn=PayGate%20payment_v4_123",
    }, 100, validationOptions);
    expect(wrongCurrency.ok).toBe(false);
    expect(wrongCurrency.error).toMatch(/UPI payment instructions/i);
    const wrongPayee = pg.validateProviderPayment({
      ...validV4Payment,
      upi_uri: "upi://pay?am=101.37&cu=INR&pa=https%3A%2F%2Fevil.example&tn=PayGate%20payment_v4_123",
    }, 100, validationOptions);
    expect(wrongPayee.ok).toBe(false);
    expect(wrongPayee.error).toMatch(/UPI payment instructions/i);
  });

  it("requires the deterministic transaction reference on create/status responses", () => {
    const missing = { ...validV4Payment } as Record<string, unknown>;
    delete missing.transaction_note;
    const result = pg.validateProviderPayment(missing, 100, { ...validationOptions, requireTransactionNote: true });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/transaction reference/i);
  });

  it("rejects .00 and fingerprints outside the v4 pools", () => {
    expect(pg.validateProviderPayment({ ...validV4Payment, payable_amount: "100.00" }, 100, validationOptions).ok).toBe(false);
    expect(pg.validateProviderPayment({ ...validV4Payment, payable_amount: "102.00" }, 100, validationOptions).ok).toBe(false);
  });

  it("rejects a different persisted payment identity", () => {
    const result = pg.validateProviderPayment(validV4Payment, 100, { ...validationOptions, paymentId: "another_payment" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/identity mismatch/i);
  });

  it("rejects wrong event, registration or environment identity", () => {
    expect(pg.validateProviderPayment(validV4Payment, 100, { ...validationOptions, externalId: "other_event" }).ok).toBe(false);
    expect(pg.validateProviderPayment(validV4Payment, 100, { ...validationOptions, registrationId: "other_registration" }).ok).toBe(false);
    expect(pg.validateProviderPayment(validV4Payment, 100, { ...validationOptions, environment: "production" }).ok).toBe(false);
  });

  it("does not accept retired camelCase registration metadata", () => {
    const camelCase = {
      ...validV4Payment,
      metadata: { registrationId: "reg_123", environment: "local" },
    };
    expect(pg.validateProviderPayment(camelCase, 100, validationOptions).ok).toBe(false);
    expect(pg.registrationIdFromProviderPayment(camelCase)).toBe("");
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
