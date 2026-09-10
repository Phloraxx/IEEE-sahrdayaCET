import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("attendee cancellation and waitlist architecture", () => {
  it("keeps cancellation requests and waitlist identities server-owned", () => {
    const migration = read("pb_migrations/202609010003_attendee_cancellation_waitlist.js");
    const routes = read("pb_hooks/attendee-lifecycle.pb.js");
    const helpers = read("pb_hooks/attendee-lifecycle-helpers.js");
    expect(migration).toContain('name: "registration_cancellation_requests"');
    expect(migration).toContain('name: "event_waitlist"');
    expect(migration.match(/listRule: null/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration.match(/viewRule: null/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration.match(/createRule: null/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration.match(/updateRule: null/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration.match(/deleteRule: null/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toContain("idx_waitlist_active_key");
    expect(migration).toContain("idx_cancel_request_active_key");
    expect(migration).toContain("idx_waitlist_event_user_status");
    expect(migration).toContain("idx_cancel_request_registration_status");
    expect(routes).toContain("activeWaitlistEntry");
    expect(helpers).toContain("activeCancellationRequest");
    expect(migration).toContain('WHERE activeKey != ""');
    expect(migration).not.toContain("WHERE status IN");
  });

  it("reserves offered seats before ordinary or admin registration", () => {
    const registration = read("pb_hooks/registration-create.pb.js");
    const admin = read("pb_hooks/admin-operations.pb.js");
    expect(registration).toContain("activeRegs.length + activeOffers.length");
    expect(registration).toContain("validOfferForUser");
    expect(registration).toContain('offeredWaitlist.set("status", "accepted")');
    expect(registration).toContain('offeredWaitlist.set("acceptedRegistration", registration.id)');
    expect(admin).toContain("reservedOffers.length");
    expect(admin).toContain("validOfferForUser");
  });

  it("promotes FIFO and retires terminal or disabled waitlists", () => {
    const helpers = read("pb_hooks/attendee-lifecycle-helpers.js");
    const routes = read("pb_hooks/attendee-lifecycle.pb.js");
    expect(helpers).toContain('"joinedAt,id"');
    expect(helpers).toContain("offerExpiresAt");
    expect(helpers).toContain("retireActiveWaitlist");
    expect(helpers).toContain("waitlistTerminal");
    expect(routes).toContain('cronAdd("attendee-lifecycle-reconcile"');
    expect(routes).toContain('status = {:waiting} || status = {:offered}');
  });

  it("separates attendee cancellation intent from payment truth", () => {
    const routes = read("pb_hooks/attendee-lifecycle.pb.js");
    const helpers = read("pb_hooks/attendee-lifecycle-helpers.js");
    const admin = read("pb_hooks/admin-operations.pb.js");
    expect(routes).toContain('"/api/app/registrations/{id}/cancel"');
    expect(routes).toContain('action: "refund_requested"');
    expect(routes).toContain('"/api/admin/cancellation-requests/{id}/decision"');
    expect(routes).not.toContain("enqueueForRegistration");
    expect(helpers).toContain('registration.getString("paymentStatus") !== "refunded"');
    expect(helpers).toContain('resolveCancellationRequestForRegistration');
    expect(admin).toContain('resolveCancellationRequestForRegistration(txApp, reg, now)');
    expect(helpers).toContain('rows[i].set("status", "resolved")');
  });

  it("surfaces the lifecycle through command clients instead of browser collection CRUD", () => {
    const myEventsClient = read("src/lib/data/my-events.client.ts");
    const publicClient = read("src/lib/data/public-client.ts");
    const myEventsPage = read("src/routes/my-events.tsx");
    expect(myEventsClient).toContain("/api/app/registrations/");
    expect(publicClient).toContain("/waitlist/join");
    expect(publicClient).toContain("/waitlist/leave");
    expect(myEventsPage).toContain("Request cancellation");
    expect(myEventsPage).toContain("Claim seat");
    expect(myEventsClient).not.toContain('collection("registration_cancellation_requests")');
    expect(publicClient).not.toContain('collection("event_waitlist")');
    expect(publicClient).not.toContain('collection("registrations")');
    expect(publicClient).toContain('/api/tickets/lookup');
  });

  it("keeps organizer policy changes in event setup without an approval gate", () => {
    const form = read("src/features/admin/events/event-form.tsx");
    for (const field of [
      "allowSelfCancellation", "selfCancellationUntil", "refundRequestUntil",
      "refundPolicy", "waitlistEnabled", "waitlistOfferMinutes",
    ]) {
      expect(form).toContain(field);
    }
    expect(form).toContain("Set a finite capacity before enabling the waitlist");
    expect(form).not.toContain("approval");
  });

  it("queries command-owned registrations by canonical registrationDate", () => {
    const projected = read("pb_hooks/admin-registrations-helpers.js");
    expect(projected).toContain("NULLIF(r.registrationDate, '')");
    expect(projected).not.toContain("r.created");
    const projection = read("pb_hooks/admin-operations-helpers.js");
    expect(projection).toContain("var createdAt = registrationDate");
  });

  it("locks raw registration list and view access behind server projections", () => {
    const migration = read("pb_migrations/202609040004_registration_privacy.js");
    expect(migration).toContain("registrations.listRule = null");
    expect(migration).toContain("registrations.viewRule = null");
    expect(migration).not.toContain(`registrations.listRule = '@request.auth.role = "admin"'`);
  });

  it("projects branch payment rows without browser-side registration expansion", () => {
    const route = read("pb_hooks/admin-payments.pb.js");
    const helper = read("pb_hooks/admin-payments-helpers.js");
    const client = read("src/lib/data/admin-payments.client.ts");
    expect(route).toContain('"/api/admin/payments"');
    expect(route).toContain('"finance.view"');
    expect(helper).toContain("LEFT JOIN registrations r ON r.id = p.registration");
    expect(client).toContain("/api/admin/payments?");
    expect(client).not.toContain('pb.collection("payments")');
    expect(client).not.toContain('expand: "registration,event"');
  });

  it("puts attendee refund requests into the existing finance workspace", () => {
    const backend = read("pb_hooks/admin-operations.pb.js");
    const client = read("src/lib/data/admin-event-operations.client.ts");
    const page = read("src/routes/admin.events.$id.tsx");
    expect(backend).toContain("cancellationRequests");
    expect(client).toContain("decideCancellationRequest");
    expect(page).toContain("Attendee refund requests");
  });
});
