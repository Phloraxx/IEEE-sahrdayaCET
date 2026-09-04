import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

class FakeRecord {
  id: string;
  values: Record<string, unknown>;
  constructor(id: string, values: Record<string, unknown>) { this.id = id; this.values = values; }
  get(key: string) { return this.values[key]; }
  getInt(key: string) { return Number(this.values[key] || 0); }
  getString(key: string) { return String(this.values[key] || ""); }
  getBool(key: string) { return Boolean(this.values[key]); }
}

function loadPricing() {
  const module = { exports: {} as Record<string, unknown> };
  runInNewContext(readFileSync("pb_hooks/event-pricing-helpers.js", "utf8"), { module, exports: module.exports, isFinite });
  return module.exports as {
    calculate: (app: FakeApp, event: FakeRecord, input: Record<string, unknown>) => Record<string, unknown>;
    validateEventConfiguration: (event: FakeRecord) => Record<string, unknown>;
    validateCouponConfiguration: (event: FakeRecord, percent: number) => Record<string, unknown>;
    validateExistingCoupons: (app: FakeApp, event: FakeRecord) => Record<string, unknown>;
  };
}

class FakeApp {
  coupon: FakeRecord | null;
  used: number;
  constructor(coupon: FakeRecord | null = null, used = 0) { this.coupon = coupon; this.used = used; }
  findFirstRecordByFilter() { if (!this.coupon) throw new Error("not found"); return this.coupon; }
  findRecordsByFilter(collection: string, _filter: string, _sort: string, limit: number, offset = 0) {
    if (collection === "coupons") return this.coupon && offset === 0 ? [this.coupon] : [];
    return Array.from({ length: Math.min(this.used, limit) }, (_, i) => new FakeRecord(String(i), {}));
  }
}

const pricing = loadPricing();
const event = (extra: Record<string, unknown> = {}) => new FakeRecord("evt", {
  price: 200, baseFeePaise: 20000, collectIeeeMember: true,
  ieeeMemberDiscountPercent: 20, ...extra,
});
const coupon = (percent: number, maxUses = 0) => new FakeRecord("coupon", { discountPercent: percent, maxUses });

describe("event pricing", () => {
  it("applies IEEE member price with a membership id", () => {
    const result = pricing.calculate(new FakeApp(), event(), { isIeeeMember: true, ieeeMembershipId: "12345" });
    expect(result).toMatchObject({ ok: true, discountSource: "ieee_member", appliedDiscountPaise: 4000, finalFeePaise: 16000, appliedCouponCode: "" });
  });

  it("requires a membership id before applying member pricing", () => {
    expect(pricing.calculate(new FakeApp(), event(), { isIeeeMember: true })).toMatchObject({ ok: false, code: "IEEE_MEMBERSHIP_ID_REQUIRED" });
  });

  it("chooses the better coupon without stacking", () => {
    const result = pricing.calculate(new FakeApp(coupon(30)), event(), { isIeeeMember: true, ieeeMembershipId: "12345", couponCode: "save30" });
    expect(result).toMatchObject({ ok: true, discountSource: "coupon", ieeeDiscountPaise: 4000, couponDiscountPaise: 6000, appliedDiscountPaise: 6000, finalFeePaise: 14000, appliedCouponCode: "SAVE30" });
  });

  it("chooses IEEE member pricing on an exact tie", () => {
    const result = pricing.calculate(new FakeApp(coupon(20)), event(), { isIeeeMember: true, ieeeMembershipId: "12345", couponCode: "tie20" });
    expect(result).toMatchObject({ ok: true, discountSource: "ieee_member", couponDiscountPaise: 4000, appliedDiscountPaise: 4000, appliedCouponCode: "" });
  });

  it("allows a 100 percent member discount to confirm for free", () => {
    const result = pricing.calculate(new FakeApp(), event({ ieeeMemberDiscountPercent: 100 }), { isIeeeMember: true, ieeeMembershipId: "12345" });
    expect(result).toMatchObject({ ok: true, discountSource: "ieee_member", finalFeePaise: 0 });
  });

  it("rejects exhausted coupons and invalid PayGate paise outcomes", () => {
    expect(pricing.calculate(new FakeApp(coupon(20, 1), 1), event(), { couponCode: "used" })).toMatchObject({ ok: false, code: "COUPON_EXHAUSTED" });
    expect(pricing.calculate(new FakeApp(), event({ price: 125, baseFeePaise: 12500, ieeeMemberDiscountPercent: 10 }), { isIeeeMember: true, ieeeMembershipId: "12345" })).toMatchObject({ ok: false, code: "PAYGATE_WHOLE_RUPEE_REQUIRED" });
  });

  it("validates organizer pricing configuration", () => {
    expect(pricing.validateEventConfiguration(event({ collectIeeeMember: false }))).toMatchObject({ ok: false, code: "IEEE_MEMBER_DETAILS_REQUIRED" });
    expect(pricing.validateEventConfiguration(event({ price: 125, baseFeePaise: 12500, ieeeMemberDiscountPercent: 10 }))).toMatchObject({ ok: false, code: "PAYGATE_WHOLE_RUPEE_REQUIRED" });
    expect(pricing.validateCouponConfiguration(event({ price: 125, baseFeePaise: 12500, ieeeMemberDiscountPercent: 0 }), 20)).toMatchObject({ ok: true });
    expect(pricing.validateCouponConfiguration(event({ price: 125, baseFeePaise: 12500, ieeeMemberDiscountPercent: 0 }), 10)).toMatchObject({ ok: false, code: "PAYGATE_WHOLE_RUPEE_REQUIRED" });
    expect(pricing.validateExistingCoupons(new FakeApp(coupon(10)), event({ price: 125, baseFeePaise: 12500, ieeeMemberDiscountPercent: 0 }))).toMatchObject({ ok: false, code: "PAYGATE_WHOLE_RUPEE_REQUIRED" });
  });
});
