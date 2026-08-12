import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("registration/payment experience architecture", () => {
  it("routes paid registrations directly to payment and free registrations to tickets", () => {
    const register = source("src/features/register/RegisterPage.tsx");
    expect(register).toContain("if (result.paymentRequired)");
    expect(register).toContain("navigate(`/payment/${result.registrationId}`)");
    expect(register).toContain("navigate(`/ticket/${result.ticketId}`)");
    expect(register).not.toContain('toast.success("Registration successful!")');
  });

  it("does not expose UPI IDs, payment IDs, or fingerprint explanations in the payment UI", () => {
    const payment = source("src/features/payment/PaymentPage.tsx");
    expect(payment).not.toMatch(/UPI ID/i);
    expect(payment).not.toMatch(/Payment ID/i);
    expect(payment).not.toMatch(/fingerprint/i);
    expect(payment).not.toMatch(/verification adjustment/i);
    expect(payment).not.toMatch(/PayGate/i);
    expect(payment).not.toMatch(/secure payment confirmation/i);
    expect(payment).toContain("Waiting for payment");
  });

  it("blocks a second registration when a paid cancelled record is under manual review", () => {
    const command = source("pb_hooks/registration-create.pb.js");
    expect(command).toContain("previousPaymentData.manualReview === true");
    expect(command).not.toContain('previousRegistration.getString("paymentStatus") !== "paid"');
    expect(command).toContain("under organizer review");
  });

  it("uses an idempotent notification outbox for ticket and receipt delivery", () => {
    const migration = source("pb_migrations/202608120001_registration_notifications.js");
    const hook = source("pb_hooks/registration-notifications.pb.js");
    expect(migration).toContain("CREATE UNIQUE INDEX idx_notification_outbox_dedupe");
    expect(hook).toContain('cronAdd("registration-notification-outbox"');
    expect(hook).toContain("$app.runInTransaction");
    expect(hook).toContain("enqueueForRegistration");
    expect(hook).toContain('/notifications/{kind}/resend');
  });

  it("keeps receipts authenticated and honors reduced-motion preferences globally", () => {
    const notifications = source("pb_hooks/registration-notifications.pb.js");
    const root = source("src/root.tsx");
    expect(notifications).toContain('/api/app/registrations/{id}/receipt');
    expect(notifications).toContain('registration.getString("user") !== auth.id');
    expect(notifications).toContain('$apis.requireAuth("users")');
    expect(root).toContain('<MotionConfig reducedMotion="user">');
  });
});
