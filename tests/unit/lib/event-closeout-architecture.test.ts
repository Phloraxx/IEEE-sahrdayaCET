import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function loadCloseoutHelper() {
  const module = { exports: {} as Record<string, any> };
  vm.runInNewContext(source("pb_hooks/event-closeout-helpers.js"), {
    module,
    exports: module.exports,
    Object,
    Date,
    isFinite,
    __hooks: "pb_hooks",
    require: (path: string) => {
      if (path.endsWith("/attendance-qualification-helpers.js")) {
        return { statusPayload: () => ({ locked: false, version: 0, lockedAt: "", requiredSessionCount: 0, sessionCount: 0 }) };
      }
      throw new Error(`Unexpected helper dependency: ${path}`);
    },
  });
  return module.exports;
}

describe("event closeout architecture", () => {
  it("uses one server readiness contract for workspace projection and archive enforcement", () => {
    const operations = source("pb_hooks/admin-operations.pb.js");
    const archive = source("pb_hooks/event-archive.pb.js");
    expect(operations).toContain("event-closeout-helpers.js");
    expect(operations).toContain("projectCloseoutSummary(closeout, projection.finance)");
    expect(archive).toContain("closeoutSummary(txApp, current)");
    expect(archive).toContain('"CLOSEOUT_BLOCKED"');
    const closeout = source("pb_hooks/event-closeout-helpers.js");
    expect(closeout).toContain('"ATTENDANCE_QUALIFICATION_UNLOCKED"');
    expect(closeout).toContain('requiredForCertificate');
  });
  it("does not reopen closeout after the event has been archived", () => {
    const helper = loadCloseoutHelper();
    const event = {
      getString: (key: string) => key === "status" ? "completed" : "",
      getBool: (key: string) => key === "isDeleted",
    };
    const app = { findRecordsByFilter: () => { throw new Error("archived closeout should not query operational rows"); } };
    expect(helper.closeoutSummary(app, event)).toMatchObject({ applicable: false, readyToArchive: false });
  });

  it("redacts finance closeout detail for non-finance workspace roles", () => {
    const helper = loadCloseoutHelper();
    const summary = {
      applicable: true,
      readyToArchive: false,
      blockers: [
        { code: "REFUNDS_UNRESOLVED", label: "Refunds", count: 2, area: "payments" },
        { code: "PENDING_REGISTRATIONS", label: "Pending", count: 1, area: "attendees" },
      ],
      warnings: [],
      certificateProgress: {
        templateCount: 1, publishedTemplateCount: 1, issuedBatchCount: 1,
        issuedCertificateCount: 2, activeCertificateCount: 2,
        emailEligibleCount: 2, sentCount: 1, failedCount: 0, missingEmailCount: 0,
      },
      metrics: {
        pendingRegistrations: 1,
        unresolvedRefundRequests: 2,
        paymentExceptions: 3,
        activeWaitlist: 0,
        attendanceSessions: 2,
        attendanceCorrections: 0,
        attendanceScheduleAnomalies: 0,
      },
    };
    const projected = helper.projectCloseoutSummary(summary, false);
    expect(projected.blockers.map((row: any) => row.code)).toEqual(["PENDING_REGISTRATIONS", "FINANCE_RECONCILIATION"]);
    expect(projected.metrics.unresolvedRefundRequests).toBeUndefined();
    expect(projected.metrics.paymentExceptions).toBeUndefined();
    expect(projected.certificateProgress).toMatchObject({ issuedCertificateCount: 2, activeCertificateCount: 2 });
  });
  it("keeps closeout visible and exposes attendance qualification independently", () => {
    const route = source("src/routes/admin.events.$id.tsx");
    const panel = source("src/features/admin/events/event-closeout-panel.tsx");
    const plan = source("docs/event-lifecycle/15-phase-5-closeout-implementation-plan.md");
    expect(route).toContain('"closeout"');
    expect(route).toContain("EventCloseoutPanel");
    expect(panel).toContain("Archive settled event");
    expect(panel).toContain("ConfirmButton");
    expect(panel).toContain("Certificate preparation and delivery stay visible at closeout, but they never block archive");
    expect(panel).toContain("SMTP handoffs");
    const closeout = source("pb_hooks/event-closeout-helpers.js");
    expect(closeout).toContain('"certificate_templates"');
    expect(closeout).toContain('"certificate_batches"');
    expect(closeout).toContain('"certificates"');
    expect(plan).toContain("Certificate progress is read-only and never changes `readyToArchive`");
    expect(plan).toContain("Do not infer eligibility from the legacy first-arrival `checkedIn` projection");
  });
});
