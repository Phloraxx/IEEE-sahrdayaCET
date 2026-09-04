import { describe, expect, it } from "vitest";
import { registrationDiscountLabel, registrationReportingSnapshot } from "@/lib/registration-reporting";

describe("registration reporting snapshots", () => {
  it("prefers canonical academic and IEEE pricing snapshots", () => {
    const snapshot = registrationReportingSnapshot({
      programmeCode: "CSE",
      semester: "S6",
      ieeeMember: true,
      ieeeMemberId: "IEEE-123",
      discountSource: "ieee_member",
      discountPaise: 4000,
      couponCode: "",
      formResponses: { branch: "Legacy branch", semester: "S1", isIeeeMember: false },
    });
    expect(snapshot).toMatchObject({
      programmeCode: "CSE",
      programme: "Computer Science & Engineering",
      semester: "S6",
      studyYear: 3,
      ieeeMember: true,
      ieeeMemberId: "IEEE-123",
      discountSource: "ieee_member",
      discountAmount: 40,
    });
    expect(registrationDiscountLabel(snapshot)).toBe("IEEE member");
  });

  it("falls back to legacy form responses and coupon data", () => {
    const snapshot = registrationReportingSnapshot({
      formResponses: { branch: "Electronics and Communication Engineering", semester: "semester 4", isIeeeMember: true, ieeeMembershipId: "LEGACY-9" },
      couponCode: "old10",
      discountAmount: 25,
    });
    expect(snapshot).toMatchObject({
      programmeCode: "ECE",
      programme: "Electronics & Communication Engineering",
      semester: "S4",
      studyYear: 2,
      ieeeMember: true,
      ieeeMemberId: "LEGACY-9",
      discountSource: "coupon",
      couponCode: "OLD10",
      discountAmount: 25,
    });
    expect(registrationDiscountLabel(snapshot)).toBe("Coupon OLD10");
  });

  it("preserves unknown legacy programme text without inventing a canonical code", () => {
    expect(registrationReportingSnapshot({ formResponses: { branch: "Architecture", semester: "Year 2" } })).toMatchObject({
      programmeCode: "",
      programme: "Architecture",
      semester: "Year 2",
      studyYear: null,
      discountSource: "none",
    });
  });
});
