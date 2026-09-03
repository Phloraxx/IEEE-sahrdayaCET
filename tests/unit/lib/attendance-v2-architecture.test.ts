import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { legacyCheckInAction } from "@/features/admin/events/event-operations-components";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Attendance V2 architecture", () => {
  it("keeps sessions and attendance records server-owned", () => {
    const migration = read("pb_migrations/202609010002_attendance_v2.js");
    expect(migration).toContain('name: "event_sessions"');
    expect(migration).toContain('name: "attendance_records"');
    expect(migration.match(/listRule: null/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration.match(/viewRule: null/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration.match(/createRule: null/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration.match(/updateRule: null/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration.match(/deleteRule: null/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toContain("idx_attendance_idempotency");
  });

  it("makes attendance history append-only and capability-scoped", () => {
    const routes = read("pb_hooks/attendance-v2.pb.js");
    expect(routes).toContain('BadRequestError("Attendance records are append-only")');
    expect(routes).toContain('"checkin.manage"');
    expect(routes).toContain('"events.edit"');
    expect(routes).toContain('code: "WRONG_EVENT"');
    expect(routes).toContain('code: "WRONG_SESSION"');
    expect(routes).toContain('code: "ALREADY_PRESENT"');
    expect(routes).toContain('code: "CHECKIN_NOT_ACTIVE"');
    expect(routes).toContain('action: "attendance.present"');
    expect(routes).toContain('action: "attendance." + action');
  });

  it("preserves the legacy first-arrival projection without allowing legacy session mutation", () => {
    const helpers = read("pb_hooks/attendance-v2-helpers.js");
    const workspace = read("pb_hooks/workspace.pb.js");
    const operations = read("pb_hooks/admin-operations.pb.js");
    expect(helpers).toContain("applyLegacyArrivalProjection");
    expect(helpers).toContain('registration.set("checkedIn", true)');
    expect(workspace).toContain('\"SESSION_REQUIRED\"');
    expect(workspace).toContain('\"WRONG_EVENT\"');
    expect(operations).toContain('code: "USE_ATTENDANCE_V2"');
    expect(operations).toContain('mode: attendanceSessions.length ? "sessions" : "legacy"');
  });

  it("keeps certificate attendance qualification disabled until closeout rules exist", () => {
    const rules = read("pb_hooks/certificate-issuance-rules.js");
    expect(rules).toContain('if (type === "attendance_qualified") errors.push("Attendance-qualified audiences require recorded attendance sessions")');
  });

  it("exposes a session-aware scanner without attendee-register access", () => {
    const scanner = read("src/routes/admin.check-in.tsx");
    expect(scanner).toContain("Start continuous scan");
    expect(scanner).toContain("Assigned event");
    expect(scanner).toContain("Attendance session");
    expect(scanner).toContain("Recent scans");
    expect(scanner).toContain("Manual ticket entry");
    expect(scanner).toContain("Append correction");
    expect(scanner).toContain("navigator.vibrate");
    expect(scanner).toContain("recordSessionAttendance");
    expect(scanner).not.toContain("listAdminRegistrations");
  });

  it("moves session-enabled attendee actions to the Attendance tab", () => {
    const eventRoute = read("src/routes/admin.events.$id.tsx");
    expect(eventRoute).toContain('"attendance"');
    expect(eventRoute).toContain("AttendanceSessionPanel");
    expect(eventRoute).toContain("sessionAttendanceActive");

    expect(legacyCheckInAction({ canCheckIn: true, sessionAttendanceActive: true, checkedIn: false, registrationStatus: "confirmed" })).toBeNull();
    expect(legacyCheckInAction({ canCheckIn: true, sessionAttendanceActive: true, checkedIn: true, registrationStatus: "confirmed" })).toBeNull();
    expect(legacyCheckInAction({ canCheckIn: false, sessionAttendanceActive: false, checkedIn: false, registrationStatus: "confirmed" })).toBeNull();
    expect(legacyCheckInAction({ canCheckIn: true, sessionAttendanceActive: false, checkedIn: false, registrationStatus: "pending" })).toBeNull();
    expect(legacyCheckInAction({ canCheckIn: true, sessionAttendanceActive: false, checkedIn: false, registrationStatus: "confirmed" })).toBe("check-in");
    expect(legacyCheckInAction({ canCheckIn: true, sessionAttendanceActive: false, checkedIn: true, registrationStatus: "cancelled" })).toBe("undo-check-in");
  });
  it("hands browser attendance fixtures across the clean-room boundary without superuser access", () => {
    const smoke = read("tests/backend/pocketbase_smoke.py");
    const e2e = read("tests/e2e/attendance-v2.e2e.ts");
    expect(smoke).toContain("E2E_ATTENDANCE_EVENT_ID");
    expect(smoke).toContain("E2E_ATTENDANCE_TICKET_ID");
    expect(smoke).toContain("E2E_ATTENDANCE_ATTENDEE_NAME");
    expect(e2e).toContain("E2E_ATTENDANCE_EVENT_ID");
    expect(e2e).toContain("E2E_ATTENDANCE_TICKET_ID");
    expect(e2e).not.toContain("PB_SUPERUSER_EMAIL");
    expect(e2e).not.toContain("_superusers");
  });

});
