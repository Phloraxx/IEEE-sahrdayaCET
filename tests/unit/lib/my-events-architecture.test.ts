import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("My Events architecture", () => {
  it("uses one authenticated no-store attendee projection", () => {
    const hook = read("pb_hooks/my-events.pb.js");
    expect(hook).toContain('"/api/app/my-events"');
    expect(hook).toContain('$apis.requireAuth("users")');
    expect(hook).toContain('"Cache-Control", "no-store"');
    expect(hook).toContain("listForUser($app, e.auth.id)");
  });

  it("scopes registrations, certificates and private access to the attendee", () => {
    const helpers = read("pb_hooks/my-events-helpers.js");
    expect(helpers).toContain('"user = {:user}"');
    expect(helpers).toContain('"registration = {:registration} && status = {:active}"');
    expect(helpers).toContain('registration.getString("registrationStatus") !== "confirmed"');
    expect(helpers).toContain('event.getString("status") !== "published"');
    expect(helpers).toContain("if (ended");
  });
  it("keeps browser data access behind the projection endpoint", () => {
    const client = read("src/lib/data/my-events.client.ts");
    const page = read("src/routes/my-events.tsx");
    expect(client).toContain('pb.send("/api/app/my-events"');
    expect(client).not.toContain('collection("registrations")');
    expect(client).not.toContain('collection("attendance_records")');
    expect(client).not.toContain('collection("certificates")');
    expect(page).not.toContain('collection("registrations")');
    expect(page).not.toContain('collection("attendance_records")');
    expect(page).not.toContain('collection("certificates")');
  });

  it("preserves archived attendee history without dead public links or double-counted summary buckets", () => {
    const helpers = read("pb_hooks/my-events-helpers.js");
    const hook = read("pb_hooks/my-events.pb.js");
    const page = read("src/routes/my-events.tsx");
    expect(helpers).toContain('isArchived: event.getBool("isDeleted")');
    expect(helpers).not.toContain('if (!event || event.getBool("isDeleted")) continue');
    expect(page).toContain('!item.event.isArchived');
    expect(hook).toContain('var needsAction =');
    expect(hook).toContain('else if (row.ended || row.event.isArchived');
  });

  it("makes attendee continuity reachable from navigation and ticket surfaces", () => {
    const routes = read("src/routes.ts");
    const nav = read("src/components/Navbar.tsx");
    const ticket = read("src/features/ticket/TicketPage.tsx");
    expect(routes).toContain('route("my-events", "routes/my-events.tsx")');
    expect(routes).toContain('route("events/:slug/calendar.ics"');
    expect(nav).toContain("My Events");
    expect(ticket).toContain('to="/my-events"');
    expect(ticket).toContain("calendar.ics");
    expect(ticket).toContain("!event.isArchived");
  });
});
