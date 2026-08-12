import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

interface ProviderHelpers {
  eventProvider(event: FakeEvent): string;
  registrationPaymentData(event: FakeEvent): Record<string, unknown>;
  razorpayExternalId(id: string): string;
  razorpayIdempotencyKey(id: string): string;
  validateOrder(
    raw: Record<string, unknown>,
    registration: FakeRegistration,
    options?: Record<string, unknown>,
  ): { ok: boolean; error?: string };
}

class FakeEvent {
  constructor(private readonly provider: string) {}
  getString(key: string) {
    return key === "paymentProvider" ? this.provider : "";
  }
}

class FakeRegistration {
  id = "reg_123";
  getInt(key: string) {
    return key === "amount" ? 250 : 0;
  }
}

function loadHelpers(): ProviderHelpers {
  const source = readFileSync(
    resolve(process.cwd(), "pb_hooks/payment-provider-helpers.js"),
    "utf8",
  );
  const module = { exports: {} as Record<string, unknown> };
  runInNewContext(source, { module, exports: module.exports, console });
  return module.exports as unknown as ProviderHelpers;
}

const providers = loadHelpers();

describe("event payment-provider locking", () => {
  it("locks Kotak and Slice to their matching direct-UPI verification accounts", () => {
    expect(providers.registrationPaymentData(new FakeEvent("kotak"))).toMatchObject({
      provider: "paygate",
      eventPaymentProvider: "kotak",
      paymentAccount: "kotak",
    });
    expect(providers.registrationPaymentData(new FakeEvent("slice"))).toMatchObject({
      provider: "paygate",
      eventPaymentProvider: "slice",
      paymentAccount: "slice",
    });
  });

  it("keeps Razorpay on its isolated live order rail", () => {
    expect(providers.registrationPaymentData(new FakeEvent("razorpay"))).toMatchObject({
      provider: "razorpay_live",
      eventPaymentProvider: "razorpay",
      providerStatus: "not_initialized",
    });
  });

  it("defaults legacy or invalid event values to Kotak", () => {
    expect(providers.eventProvider(new FakeEvent(""))).toBe("kotak");
    expect(providers.eventProvider(new FakeEvent("other"))).toBe("kotak");
  });

  it("keeps legacy event creation compatible while registration defaults safely", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "pb_migrations/202608120003_relax_event_payment_provider_requirement.js"),
      "utf8",
    );
    expect(migration).toContain("field.required = false");
  });
});

describe("Razorpay order boundaries", () => {
  const registration = new FakeRegistration();
  const valid = {
    id: "local_order_123",
    amountPaise: 25000,
    currency: "INR",
    status: "created",
    externalId: "ieee-registration:reg_123",
    razorpayOrderId: "order_123",
    keyId: "rzp_live_public",
  };

  it("uses deterministic registration identity and idempotency", () => {
    expect(providers.razorpayExternalId("reg_123")).toBe("ieee-registration:reg_123");
    expect(providers.razorpayIdempotencyKey("reg_123")).toBe("ieee-razorpay-reg_123");
  });

  it("accepts only the exact registration amount and identity", () => {
    expect(providers.validateOrder(valid, registration, { requireCheckout: true }).ok).toBe(true);
    expect(providers.validateOrder({ ...valid, amountPaise: 24900 }, registration).ok).toBe(false);
    expect(providers.validateOrder({ ...valid, externalId: "ieee-registration:other" }, registration).ok).toBe(false);
    expect(providers.validateOrder({ ...valid, currency: "USD" }, registration).ok).toBe(false);
  });
});

describe("admin payment route selector", () => {
  it("offers Razorpay, Kotak and Slice and explains immutable registrations", () => {
    const form = readFileSync(
      resolve(process.cwd(), "src/features/admin/events/event-form.tsx"),
      "utf8",
    );
    expect(form).toContain('<SelectItem value="razorpay">Razorpay Checkout</SelectItem>');
    expect(form).toContain('<SelectItem value="kotak">Kotak UPI — SMS verified</SelectItem>');
    expect(form).toContain('<SelectItem value="slice">Slice UPI — email verified</SelectItem>');
    expect(form).toContain("souravpbijoy-3@okicici");
    expect(form).toContain("Existing registrations");
  });
});
