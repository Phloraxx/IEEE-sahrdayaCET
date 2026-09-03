import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
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
    expect(register).toContain("Your reusable attendee details are remembered after you register. This event draft stays on this device while you type.");
  });

  it("keeps payment and ticket poster-independent throughout the transaction", () => {
    const payment = source("src/features/payment/PaymentPage.tsx");
    const providerUi = source("src/features/payment/payment-provider-panels.tsx");
    const ticket = source("src/features/ticket/TicketPage.tsx");
    expect(providerUi).toContain("Registration / Payment");
    for (const paymentSource of [payment, providerUi]) {
      expect(paymentSource).not.toContain("event?.bannerUrl ?");
      expect(paymentSource).not.toContain("radial-gradient(circle_at_18%_8%");
    }
    expect(ticket).toContain("Check-in code");
    expect(ticket).toContain("Show this at check-in.");
    expect(ticket).not.toContain("event?.bannerUrl ?");
    expect(ticket).not.toContain("<Navbar");
  });

  it("uses an IEEE-branded Razorpay Custom Checkout that exposes UPI only", () => {
    const payment = source("src/features/payment/PaymentPage.tsx");
    const providerUi = source("src/features/payment/payment-provider-panels.tsx");
    const custom = source("src/lib/razorpay-upi.client.ts");
    expect(providerUi).toContain("IEEE Sahrdaya Secure UPI");
    expect(providerUi).toContain("Show UPI QR");
    expect(payment).toContain("startUpiIntent");
    expect(payment).toContain('method: "upi"');
    expect(payment).toContain('flow: "qr"');
    expect(providerUi).toContain("Processed securely by Razorpay");
    for (const paymentSource of [payment, providerUi]) {
      expect(paymentSource).not.toContain("Pay securely with Razorpay");
      expect(paymentSource).not.toContain("card or another method");
    }
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
    const providerUi = source("src/features/payment/payment-provider-panels.tsx");
    expect(payment).toContain("setUpiIntentEnabled(capability.intentEnabled)");
    expect(providerUi).toContain("isMobileUpi && !upiIntentEnabled");
    expect(providerUi).toContain("UPI Intent activation pending");
    expect(providerUi).toContain("isMobileUpi && upiIntentEnabled");
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
  it("keeps the registration email as a poster-independent issued credential", () => {
    const notifications = source("pb_hooks/notification-helpers.js");
    expect(notifications).toContain('subject: "Your Ticket for " + rawTitle');
    expect(notifications).toContain('max-width:430px');
    expect(notifications).toContain('Your pass is ready.');
    expect(notifications).toContain('>Event credential</td>');
    expect(notifications).toContain('background:#00629b');
    expect(notifications).toContain('htmlEscape(parts.day)');
    expect(notifications).toContain('>Issued to</p>');
    expect(notifications).toContain('border-top:1px dashed #c8c5bd');
    expect(notifications).toContain('>Check-in</p>');
    expect(notifications).toContain('>Open e-ticket&nbsp;&nbsp;→</a>');
    expect(notifications).toContain('var entryLabel = isPaid ? "PAID · ₹" + paidAmount(registration) : "FREE ENTRY"');
    expect(notifications).not.toContain('var banner = getBannerUrl(event)');
  });

  it("renders the real ticket QR in confirmation email through a first-party PNG endpoint", () => {
    const routes = source("src/routes.ts");
    const qrRoute = source("src/routes/ticket-qr.$ticketId.ts");
    const notifications = source("pb_hooks/notification-helpers.js");
    const registrationHooks = source("pb_hooks/registrations.pb.js");
    expect(routes).toContain('route("ticket/:ticketId/qr.png"');
    expect(qrRoute).toContain("QRCode.toBuffer");
    expect(qrRoute).toContain("/api/tickets/lookup?ticketId=");
    // A banner URL failure must not erase ticket event metadata such as date/venue.
    expect(registrationHooks).toContain('try { bannerUrl = $app.filesystem().fileUrl(evt, banner) } catch (_) {}');
    expect(qrRoute).toContain('"Content-Type": "image/png"');
    expect(notifications).toContain('var qrHref = ticketHref + "/qr.png"');
    expect(notifications).toContain('alt="Ticket QR code"');
  });
  it("uses one restrained motion language across event checkout and ticket success", () => {
    const motionSystem = source("src/lib/motion.ts");
    const eventDetail = source("src/routes/events.$slug.tsx");
    const register = source("src/features/register/RegisterPage.tsx");
    const providerUi = source("src/features/payment/payment-provider-panels.tsx");
    const ticket = source("src/features/ticket/TicketPage.tsx");

    expect(motionSystem).toContain("MOTION_EASE");
    expect(motionSystem).toContain("eventTitleSize");
    expect(eventDetail).toContain("compactMobileAction");
    expect(eventDetail).toContain("eventTitleSize(event.title)");
    expect(register).toContain("FieldLabel");
    expect(register).toContain("Reserving your seat…");
    expect(providerUi).toContain("Opening ${UPI_APP_LABELS[app] || app}…");
    expect(ticket).toContain("qrSaved");
    expect(ticket).toContain("Saved</>");
  });

  it("routes temporary Kotak payments per event without changing Razorpay defaults", () => {
    const migration = source("pb_migrations/202608150001_temporary_kotak_paygate_provider.js");
    const selection = source("pb_hooks/payment-provider-selection.js");
    const registration = source("pb_hooks/registration-create.pb.js");
    const direct = source("pb_hooks/razorpay-direct.pb.js");
    const paygate = source("pb_hooks/paygate-helpers.js");
    const webhook = source("pb_hooks/paygate.pb.js");
    const eventForm = source("src/features/admin/events/event-form.tsx");
    const providerUi = source("src/features/payment/payment-provider-panels.tsx");
    const admin = source("pb_hooks/admin-operations.pb.js");

    expect(migration).toContain('values: ["razorpay", "kotak"]');
    expect(migration).toContain('row.set("paymentProvider", "razorpay")');
    expect(selection).toContain('var KOTAK = "kotak"');
    expect(selection).toContain('provider: selected === KOTAK ? "paygate" : "razorpay"');
    expect(registration).toContain("providerSelection.eventProvider(event)");
    expect(registration).toContain("finalFeePaise % 100 !== 0");
    expect(direct).toContain("providerData.provider === paygate.PAYGATE_PROVIDER");
    expect(paygate).toContain('source: "ieee-sahrdaya-kotak-temporary"');
    expect(paygate).toContain("deploymentNamespace");
    expect(paygate).toContain('"ieee-paygate-" + deploymentNamespace()');
    expect(webhook).toContain("reconcilePaymentForRegistration(registration)");
    expect(webhook).toContain("providerAuthoritative");
    expect(webhook).toContain("data.paymentId && !providerAuthoritative");
    expect(source("pb_migrations/202608150002_existing_paid_events_kotak_fallback.js")).toContain('row.set("paymentProvider", "kotak")');
    expect(source("pb_migrations/202608150003_paygate_payment_ledger_provider.js")).toContain('["razorpay", "paygate", "manual", "legacy_paygate"]');
    expect(paygate).toContain("syncPaymentLedger");
    expect(paygate).toContain('confirmationSource: PAYGATE_PROVIDER');
    expect(source("pb_hooks/admin-operations.pb.js")).toContain("paygateCollectedAmount");
    expect(source("src/routes/admin.payments.tsx")).toContain("Kotak via PayGate");
    expect(source("pb_hooks/razorpay-direct-helpers.js")).toContain('String(config.keyId).indexOf("rzp_live_") !== 0');
    expect(paygate).toContain("Date.now() - lastSyncedAt < 4000");
    expect(webhook).toContain('X-PayGate-Signature');
    expect(webhook).toContain('payment.paid');
    expect(eventForm).toContain("Advanced payment processing");
    expect(eventForm).toContain("Kotak direct UPI");
    expect(providerUi).toContain("Temporary · Kotak direct UPI");
    expect(providerUi).toContain("Open in UPI app");
    expect(providerUi).toContain("Pay this exact amount");
    expect(admin).toContain("PAYGATE_PAYMENT_EXISTS");
  });

  it("keeps event-operation registration summaries identical across bounded batches", () => {
    class FakeRecord {
      constructor(private readonly values: Record<string, unknown>) {}
      get(key: string) { return this.values[key]; }
      getString(key: string) { return String(this.values[key] || ""); }
      getInt(key: string) { return Number(this.values[key] || 0); }
      getBool(key: string) { return Boolean(this.values[key]); }
    }
    const registrationHelpers = {
      registrationJsonObject: (value: unknown) => value && typeof value === "object" ? value : {},
      registrationAmount: (record: FakeRecord) => Number(record.getInt("finalFeePaise") || record.get("amount") || 0) / (record.getInt("finalFeePaise") ? 100 : 1),
      registrationDiscountAmount: (record: FakeRecord) => Number(record.getInt("discountPaise") || record.get("discountAmount") || 0) / (record.getInt("discountPaise") ? 100 : 1),
    };
    const module = { exports: {} as Record<string, unknown> };
    runInNewContext(source("pb_hooks/admin-operations-helpers.js"), {
      module,
      exports: module.exports,
      __hooks: "/hooks",
      require: (path: string) => path.endsWith("registration-helpers.js") ? registrationHelpers : {},
    });
    const helpers = module.exports as {
      emptyRegistrationSummary: () => Record<string, unknown>;
      addRegistrationsToSummary: (summary: Record<string, unknown>, records: FakeRecord[]) => Record<string, unknown>;
      summarizeRegistrations: (records: FakeRecord[]) => Record<string, unknown>;
    };
    const records = [
      new FakeRecord({ registrationStatus: "confirmed", paymentStatus: "paid", registrationSource: "admin", finalFeePaise: 12000, discountPaise: 500, paymentData: { provider: "manual", manualConfirmation: {}, payableAmountPaise: 12000 } }),
      new FakeRecord({ registrationStatus: "pending", paymentStatus: "pending", finalFeePaise: 8000, paymentData: { provider: "razorpay" } }),
      new FakeRecord({ registrationStatus: "cancelled", paymentStatus: "paid", finalFeePaise: 10000, paymentData: { provider: "paygate", eventPaymentProvider: "kotak", payableAmountPaise: 10031, manualReview: true } }),
      new FakeRecord({ registrationStatus: "confirmed", paymentStatus: "not_required", paymentData: {} }),
      new FakeRecord({ registrationStatus: "cancelled", paymentStatus: "refunded", finalFeePaise: 5000, paymentData: { provider: "manual", amountRefundedPaise: 5000 } }),
    ];
    const oneShot = helpers.summarizeRegistrations(records);
    const chunked = helpers.emptyRegistrationSummary();
    helpers.addRegistrationsToSummary(chunked, records.slice(0, 2));
    helpers.addRegistrationsToSummary(chunked, records.slice(2, 4));
    helpers.addRegistrationsToSummary(chunked, records.slice(4));
    expect(chunked).toEqual(oneShot);
    expect(chunked).toMatchObject({ totalRecords: 5, confirmed: 2, pending: 1, cancelled: 2, paidCount: 2, pendingPaymentCount: 1, refundedCount: 1, adminCreatedCount: 1 });
  });

});
