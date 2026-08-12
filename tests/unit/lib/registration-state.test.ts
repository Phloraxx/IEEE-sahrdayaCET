import { describe, expect, it } from "vitest";
import { registrationAction, type MyEventRegistration } from "@/lib/registration-state";

const base: MyEventRegistration = {
  found: true,
  registrationId: "reg-1",
  registrationStatus: "confirmed",
  paymentStatus: "not_required",
  amount: 0,
  paymentRequired: false,
  ticketId: "TKT-1",
  manualReview: false,
  reviewReason: "",
  receiptAvailable: false,
  eventEnded: false,
  ticketEmailStatus: "",
  receiptEmailStatus: "",
};

describe("registration action", () => {
  it("never offers registration when an existing ticket exists, even after the event closes", () => {
    expect(registrationAction(base, false)).toBe("ticket");
  });

  it("continues an existing paid registration instead of making a second one", () => {
    expect(registrationAction({ ...base, registrationStatus: "pending", paymentStatus: "pending", amount: 100, paymentRequired: true, ticketId: "" }, true)).toBe("payment");
  });

  it("blocks a second payment while a previous paid registration is under review", () => {
    expect(registrationAction({ ...base, registrationStatus: "cancelled", paymentStatus: "paid", manualReview: true, ticketId: "" }, true)).toBe("review");
  });

  it("allows a fresh registration only when there is no active/review state and registration is open", () => {
    expect(registrationAction(null, true)).toBe("register");
    expect(registrationAction(null, false)).toBe("closed");
  });
});
