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
    expect(register).toContain("navigate(`/payment/${result.registrationId}`, { replace: true })");
    expect(register).toContain("navigate(`/ticket/${result.ticketId}`, { replace: true })");
    expect(register).not.toContain('toast.success("Registration successful!")');
  });

  it("uses Razorpay Standard Checkout without the retired direct-UPI flow", () => {
    const payment = source("src/features/payment/PaymentPage.tsx");
    expect(payment).toContain("Pay securely with Razorpay");
    expect(payment).toContain("server-side");
    expect(payment).toContain("razorpayOrderId");
    expect(payment).toContain("razorpayKeyId");
    expect(payment).not.toMatch(/fingerprint/i);
    expect(payment).not.toContain("Save QR as PNG");
    expect(payment).not.toContain("Open UPI app");
    expect(payment).not.toContain("@/lib/upi");
  });

  it("blocks a second registration when a paid cancelled record is under manual review", () => {
    const command = source("pb_hooks/registration-create.pb.js");
    expect(command).toContain("previousPaymentData.manualReview === true");
    expect(command).toContain("rh.registrationJsonObject");
    expect(command).not.toMatch(/\bpg\./);
    expect(command).not.toContain(
      'previousRegistration.getString("paymentStatus") !== "paid"',
    );
    expect(command).toContain("under organizer review");
  });

  it("keeps Razorpay refunds manual-only", () => {
    const direct = source("pb_hooks/razorpay-direct.pb.js");
    const state = source("pb_hooks/razorpay-payment-state.js");
    const cancellation = source("pb_hooks/event-cancellation.pb.js");
    const admin = source("pb_hooks/admin-operations.pb.js");
    expect(direct).not.toContain('cronAdd("razorpay-refund-worker"');
    expect(direct).not.toContain('/refund",');
    expect(state).not.toContain("ensureRefund");
    expect(cancellation).toContain("refund manually in the Razorpay Dashboard");
    expect(admin).toContain("RAZORPAY_REFUND_MANUAL_ONLY");
  });

  it("uses an idempotent notification outbox for ticket and receipt delivery", () => {
    const migration = source(
      "pb_migrations/202608120001_registration_notifications.js",
    );
    const hook = source("pb_hooks/registration-notifications.pb.js");
    expect(migration).toContain(
      "CREATE UNIQUE INDEX idx_notification_outbox_dedupe",
    );
    expect(hook).toContain('cronAdd("registration-notification-outbox"');
    expect(hook).toContain("$app.runInTransaction");
    expect(hook).toContain("enqueueForRegistration");
    expect(hook).toContain("/notifications/{kind}/resend");
  });

  it("confirms pending payments through one audited admin command", () => {
    const command = source("pb_hooks/admin-operations.pb.js");
    const invariants = source("pb_hooks/registrations.pb.js");
    const client = source("src/lib/data/admin-registrations.client.ts");
    const list = source("src/routes/admin.registrations.index.tsx");
    const detail = source("src/features/admin/registrations/registration-detail.tsx");
    expect(command).toContain('/api/admin/registrations/{id}/command');
    expect(command).toContain('action === "confirm-payment"');
    expect(command).toContain("paymentState.findLedger");
    expect(command).toContain('provider: "manual"');
    expect(command).toContain('RAZORPAY_ORDER_EXISTS');
    expect(invariants).toContain("Payment state can only be changed through a payment command");
    expect(client).toContain("confirmRegistrationPayment");
    expect(client).not.toContain('/confirm-payment');
    expect(list).toContain('label="Confirm payment"');
    expect(detail).toContain('label="Confirm payment"');
  });

  it("keeps receipts authenticated and honors reduced-motion preferences globally", () => {
    const notifications = source("pb_hooks/registration-notifications.pb.js");
    const root = source("src/root.tsx");
    expect(notifications).toContain("/api/app/registrations/{id}/receipt");
    expect(notifications).toContain(
      'registration.getString("user") !== auth.id',
    );
    expect(notifications).toContain('$apis.requireAuth("users")');
    expect(root).toContain('<MotionConfig reducedMotion="user">');
  });
  it("renders the real ticket QR in confirmation email through a first-party PNG endpoint", () => {
    const routes = source("src/routes.ts");
    const qrRoute = source("src/routes/ticket-qr.$ticketId.ts");
    const notifications = source("pb_hooks/notification-helpers.js");
    expect(routes).toContain('route("ticket/:ticketId/qr.png"');
    expect(qrRoute).toContain("QRCode.toBuffer");
    expect(qrRoute).toContain("/api/tickets/lookup?ticketId=");
    expect(qrRoute).toContain('"Content-Type": "image/png"');
    expect(notifications).toContain('var qrHref = ticketHref + "/qr.png"');
    expect(notifications).toContain('alt="Ticket QR code"');
  });
});
