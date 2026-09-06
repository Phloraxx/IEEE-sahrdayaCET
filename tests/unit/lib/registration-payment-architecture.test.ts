import { existsSync, readFileSync } from "node:fs";
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
  it("gates ticket QR/check-in UI by ticket lifecycle and keeps the QR endpoint private", () => {
    const ticket = source("src/features/ticket/TicketPage.tsx");
    const qrRoute = source("src/routes/ticket-qr.$ticketId.ts");
    expect(ticket).toContain("getTicketCheckInState");
    expect(ticket).toContain('checkInState === "eligible"');
    expect(ticket).toContain('data-check-in-state={checkInState}');
    expect(ticket).toContain('Ticket / {ticketStateLabel[checkInState]}');
    expect(ticket).toContain('ticketData?.ticket?.registrationStatus === "confirmed"');
    for (const copy of [
      "This ticket was cancelled.",
      "This event has ended.",
      "Check-in is unavailable for this event.",
      "This registration is not confirmed.",
      "Check-in is not open for this event.",
    ]) {
      expect(ticket).toContain(copy);
    }
    expect(ticket).toContain("Show this at check-in.");
    expect(qrRoute).toContain("getTicketCheckInState");
    expect(qrRoute).toContain('getTicketCheckInState(registrationStatus, event)');
    expect(ticket).toContain('disabled: "Paused"');
    expect(qrRoute).toContain('"Cache-Control": "no-store"');
    expect(qrRoute).not.toContain('"Cache-Control": "public, max-age=86400"');
    expect(source("pb_hooks/registrations.pb.js")).toContain('timeTbc: evt.getBool("timeTbc")');
    expect(source("pb_hooks/registrations.pb.js")).toContain('checkInEnabled: evt.getBool("checkInEnabled")');
    expect(source("src/lib/data/public-client.ts")).toContain('timeTbc: data.event.timeTbc === true');
    expect(source("src/lib/data/public-client.ts")).toContain('checkInEnabled: data.event.checkInEnabled === true');
  });

  it("keeps cancelled and archived events terminal for active registrations", () => {
    const modelHook = source("pb_hooks/registration-event-state.pb.js");
    const modelHelper = source("pb_hooks/registration-event-state-helpers.js");
    const adminOps = source("pb_hooks/admin-operations.pb.js");
    const adminRoute = source("src/routes/admin.events.$id.tsx");
    const row = source("src/features/admin/events/event-operations-components.tsx");
    const opsHelper = source("pb_hooks/admin-operations-helpers.js");
    expect(modelHook).toContain('require(__hooks + "/registration-event-state-helpers.js")');
    expect(modelHelper).toContain('event.getBool("isDeleted") || event.getString("status") === "cancelled"');
    expect(adminOps).toContain('code: "EVENT_FINAL"');
    expect(adminOps).toContain("Cancelled or archived events cannot receive new registrations");
    expect(adminOps).toContain("Cancelled or archived events cannot restore registrations");
    expect(opsHelper).toContain('isArchived: event.getBool("isDeleted")');
    expect(adminRoute).toContain('event.status !== "cancelled" && !event.isArchived');
    expect(adminRoute).toContain('permissions["registrations.manual"] && eventRegistrationActive');
    expect(row).toContain('const canRestore = eventRegistrationActive &&');
  });

  it("uses PayGate v4 UPI without a browser checkout SDK", () => {
    const payment = source("src/features/payment/PaymentPage.tsx");
    const providerUi = source("src/features/payment/payment-provider-panels.tsx");
    const client = source("src/lib/data/payment.client.ts");
    expect(providerUi).toContain("UPI payment");
    expect(providerUi).toContain("Scan with any UPI app");
    expect(providerUi).toContain("Verified securely by PayGate");
    expect(payment).toContain('session?.provider === "paygate" ? session.upiUri || "" : ""');
    expect(payment).not.toContain("minimalPayGateUpiUri");
    expect(client).not.toContain("razorpayOrderId");
    expect(client).not.toContain("razorpay-verify");
    expect(existsSync(resolve(process.cwd(), "src/lib/razorpay-upi.client.ts"))).toBe(false);
  });

  it("makes confirmed-attendee WhatsApp access prominent after payment success", () => {
    const payment = source("src/features/payment/PaymentPage.tsx");
    expect(payment).toContain("getEventJoinDetails(session.event.id)");
    expect(payment).toContain("Join WhatsApp group");
    expect(payment).toContain("successWhatsappUrl");
    expect(payment).toContain("View ticket");
    expect(payment).not.toContain("Taking you there now.");
    expect(payment).not.toContain('window.setTimeout(\n      () => navigate(`/ticket/${session.ticketId}`');
  });

  it("keeps browser status reads local and backs PayGate reconciliation off", () => {
    const payment = source("src/features/payment/PaymentPage.tsx");
    const client = source("src/lib/data/payment.client.ts");
    const route = source("pb_hooks/payment.pb.js");
    const paygate = source("pb_hooks/paygate-helpers.js");
    expect(payment).toContain("LOCAL_PAYMENT_STATUS_POLL_MS");
    expect(payment).toContain("providerReconcileDelayMs");
    expect(payment).toContain("providerRetryAfterMs");
    expect(client).toContain("reconcilePaymentSession");
    expect(client).toContain("/payment/reconcile");
    expect(route).toContain('/payment/reconcile", function');
    expect(paygate).toContain("Date.now() - lastSyncedAt < 4000");
    expect(paygate).toContain("PAYGATE_RATE_LIMITED");
  });

  it("uses the exact PayGate UPI URI for both QR and mobile intent", () => {
    const payment = source("src/features/payment/PaymentPage.tsx");
    const providerUi = source("src/features/payment/payment-provider-panels.tsx");
    expect(payment).toContain("QRCode.toDataURL(payGateUpiUri");
    expect(providerUi).toContain("src={qrDataUrl}");
    expect(providerUi).toContain("href={qrDataUrl}");
    expect(providerUi).toContain('download="paygate-payment.png"');
    expect(providerUi).toContain("href={payGateUpiUri}");
    expect(payment).not.toContain('searchParams.delete("tn")');
    expect(payment).not.toContain('searchParams.delete("tr")');
    expect(payment).not.toContain("PREFERRED_UPI_APPS");
    expect(providerUi).not.toContain("Choose your UPI app");
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

  it("keeps external refund recording provider-neutral", () => {
    const cancellation = source("pb_hooks/event-cancellation.pb.js");
    const admin = source("pb_hooks/admin-operations.pb.js");
    const operations = source("src/features/admin/events/event-operations-components.tsx");
    expect(cancellation).toContain("manual refund requires organizer resolution");
    expect(cancellation).not.toContain("Razorpay Dashboard");
    expect(admin).not.toContain("RAZORPAY_REFUND_MANUAL_ONLY");
    expect(operations).toContain('row.paymentStatus === "paid"');
    expect(operations).not.toContain('row.provider !== "razorpay"');
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
    expect(command).toContain('/api/admin/registrations/{id}/command');
    expect(command).toContain('action === "confirm-payment"');
    expect(command).toContain("paymentLedger.findLatestForRegistration");
    expect(command).toContain('provider: "manual"');
    expect(command).toContain('PROVIDER_PAYMENT_EXISTS');
    expect(command).not.toContain('RAZORPAY_ORDER_EXISTS');
    expect(invariants).toContain("Payment state can only be changed through a payment command");
    expect(client).toContain("confirmRegistrationPayment");
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
    expect(notifications).toContain('function ticketEmailRequirements(event)');
    expect(notifications).toContain('>Before the event</p>');
    expect(notifications).toContain('Open your e-ticket for participant links and the latest attendee information.');
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
    expect(eventDetail).toContain("compactMobileAction");
    expect(register).toContain("Reserving your seat…");
    expect(providerUi).toContain("Preparing your UPI QR…");
    expect(providerUi).toContain("reduceMotion");
    expect(ticket).toContain("qrSaved");
  });

  it("routes every paid IEEE registration through PayGate v4", () => {
    const migration = source("pb_migrations/202609050001_paygate_v4_only.js");
    const registration = source("pb_hooks/registration-create.pb.js");
    const paymentRoute = source("pb_hooks/payment.pb.js");
    const paygate = source("pb_hooks/paygate-helpers.js");
    const webhook = source("pb_hooks/paygate.pb.js");
    const eventForm = source("src/features/admin/events/event-form.tsx");
    const providerUi = source("src/features/payment/payment-provider-panels.tsx");
    expect(migration).toContain('getByName("paymentProvider")');
    expect(registration).toContain('provider: paygate.PAYGATE_PROVIDER');
    expect(registration).not.toContain("providerSelection");
    expect(paymentRoute).toContain("PAYMENT_PROVIDER_RETIRED");
    expect(paygate).toContain('"/v1/payments"');
    expect(paygate).not.toContain('"/api/payments/"');
    expect(paygate).not.toContain("PAYGATE_API_VERSION");
    expect(webhook).toContain("X-PayGate-Signature");
    expect(webhook).toContain("payment.paid");
    expect(eventForm).not.toContain("Payment provider");
    expect(eventForm).not.toContain("Kotak direct UPI");
    expect(providerUi).not.toContain("Kotak");
    expect(providerUi).not.toContain("Razorpay");
    expect(existsSync(resolve(process.cwd(), "pb_hooks/payment-provider-selection.js"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "pb_hooks/razorpay-direct.pb.js"))).toBe(false);
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
