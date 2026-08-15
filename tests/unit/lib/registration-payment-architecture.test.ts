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

  it("uses a checkout-style registration screen without a repeated event hero", () => {
    const register = source("src/features/register/RegisterPage.tsx");
    expect(register).not.toContain("function EventHero");
    expect(register).not.toContain("bannerUrl ?");
    expect(register).toContain("01 / Attendee");
    expect(register).toContain("Review & continue");
    expect(register).toContain("Back to event");
    expect(register).toContain("BookingProgress");
    expect(register).toContain("Your profile and this form are saved on this device while you type.");
  });

  it("keeps payment and ticket poster-independent throughout the transaction", () => {
    const payment = source("src/features/payment/PaymentPage.tsx");
    const ticket = source("src/features/ticket/TicketPage.tsx");
    expect(payment).toContain("Registration / Payment");
    expect(payment).not.toContain("event?.bannerUrl ?");
    expect(payment).not.toContain("radial-gradient(circle_at_18%_8%");
    expect(ticket).toContain("Check-in code");
    expect(ticket).toContain("Show this at check-in.");
    expect(ticket).not.toContain("event?.bannerUrl ?");
    expect(ticket).not.toContain("<Navbar");
  });

  it("uses an IEEE-branded Razorpay Custom Checkout that exposes UPI only", () => {
    const payment = source("src/features/payment/PaymentPage.tsx");
    const custom = source("src/lib/razorpay-upi.client.ts");
    expect(payment).toContain("IEEE Sahrdaya Secure UPI");
    expect(payment).toContain("Show UPI QR");
    expect(payment).toContain("startUpiIntent");
    expect(payment).toContain('method: "upi"');
    expect(payment).toContain('flow: "qr"');
    expect(payment).toContain("Processed securely by Razorpay");
    expect(payment).not.toContain("Pay securely with Razorpay");
    expect(payment).not.toContain("card or another method");
    expect(custom).toContain("https://checkout.razorpay.com/v1/razorpay.js");
    expect(custom).toContain("methods.upi === true");
    expect(custom).toContain("getSupportedUpiIntentApps");
    expect(custom).not.toContain("checkout.js");
  });

  it("keeps browser status reads local and backs provider reconciliation off", () => {
    const payment = source("src/features/payment/PaymentPage.tsx");
    const client = source("src/lib/data/payment.client.ts");
    const direct = source("pb_hooks/razorpay-direct.pb.js");
    expect(payment).toContain("LOCAL_PAYMENT_STATUS_POLL_MS");
    expect(payment).toContain("providerReconcileDelayMs");
    expect(payment).toContain("providerRetryAfterMs");
    expect(payment).not.toContain("setInterval(poll, 2000)");
    expect(client).toContain("reconcilePaymentSession");
    expect(client).toContain("/payment/reconcile");
    expect(direct).toContain("Local-only status read");
    expect(direct).toContain('/payment/reconcile", function');
    expect(direct).toContain("Date.now() - lastSyncedAt < 4000");
    expect(direct).toContain("RAZORPAY_RATE_LIMITED");
  });

  it("does not expose mobile UPI app buttons before Intent is enabled", () => {
    const payment = source("src/features/payment/PaymentPage.tsx");
    expect(payment).toContain("setUpiIntentEnabled(capability.intentEnabled)");
    expect(payment).toContain("isMobileUpi && !upiIntentEnabled");
    expect(payment).toContain("UPI Intent activation pending");
    expect(payment).toContain("isMobileUpi && upiIntentEnabled");
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
  it("uses one restrained motion language across event checkout and ticket success", () => {
    const motionSystem = source("src/lib/motion.ts");
    const eventDetail = source("src/routes/events.$slug.tsx");
    const register = source("src/features/register/RegisterPage.tsx");
    const payment = source("src/features/payment/PaymentPage.tsx");
    const ticket = source("src/features/ticket/TicketPage.tsx");

    expect(motionSystem).toContain("MOTION_EASE");
    expect(motionSystem).toContain("eventTitleSize");
    expect(eventDetail).toContain("compactMobileAction");
    expect(eventDetail).toContain("eventTitleSize(event.title)");
    expect(register).toContain("FieldLabel");
    expect(register).toContain("Reserving your seat…");
    expect(payment).toContain("Opening ${UPI_APP_LABELS[app] || app}…");
    expect(ticket).toContain("qrSaved");
    expect(ticket).toContain("Saved</>");
  });

});
