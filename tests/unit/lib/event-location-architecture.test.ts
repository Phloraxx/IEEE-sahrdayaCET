import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("event location and private access architecture", () => {
  it("stores public location facts on events and keeps attendee access separate", () => {
    const migration = read("pb_migrations/202609010001_event_location_model.js");
    expect(migration).toContain('name: "timezone"');
    expect(migration).toContain('name: "attendanceMode"');
    expect(migration).toContain('name: "locationAddress"');
    expect(migration).toContain('name: "event_private_details"');
    expect(migration).toContain("listRule: null");
    expect(migration).toContain("viewRule: null");
    expect(migration).toContain("createRule: null");
    expect(migration).toContain("updateRule: null");
    expect(migration).toContain("deleteRule: null");
  });

  it("never includes private join data in the public event projection", () => {
    const publicEvents = read("src/server/public/events.server.ts");
    const detail = read("src/routes/events.$slug.tsx");
    expect(publicEvents).toContain("timezone,attendanceMode,locationAddress");
    expect(publicEvents).not.toContain("virtualJoinUrl");
    expect(publicEvents).not.toContain("joinInstructions");
    expect(detail).toContain("Private meeting URLs are intentionally excluded from public event data");
    expect(detail).toContain("url: canonicalUrl");
  });

  it("requires organizer edit permission and confirmed attendee registration", () => {
    const hook = read("pb_hooks/event-private-details.pb.js");
    const helpers = read("pb_hooks/event-private-details-helpers.js");
    expect(hook).toContain('"events.edit"');
    expect(hook).toContain('CONFIRMED_REGISTRATION_REQUIRED');
    expect(hook).toContain('event.private-access.updated');
    expect(hook).toContain('require(__hooks + "/event-private-details-helpers.js")');
    expect(helpers).toContain('registrationStatus = {:confirmed}');
    expect(helpers).toContain('privateSummary');
  });

  it("keeps the event editor explicit about public and private links", () => {
    const form = read("src/features/admin/events/event-form.tsx");
    expect(form).toContain("Public supporting link");
    expect(form).toContain("Private attendee access");
    expect(form).toContain("Never put a private meeting URL");
    expect(form).toContain("Asia/Kolkata");
    expect(form).toContain("if (setupChanged)");
    expect(form).toContain("if (isEdit && privateDirty)");
    expect(form).toContain("Private attendee access saved");
  });
});
