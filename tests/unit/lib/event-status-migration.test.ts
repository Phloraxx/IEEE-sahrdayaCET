import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("legacy AGM event status migration", () => {
  it("normalizes only the exact legacy AGM record", () => {
    const source = read("pb_migrations/202607210003_normalize_legacy_agm_event_status.js");
    expect(source).toContain('LEGACY_AGM_EVENT_ID = "6nf000tgyzcpq49"');
    expect(source).toContain('LEGACY_AGM_TITLE = "IEEE AGM \'26"');
    expect(source).toContain('LEGACY_AGM_DATE = "2026-03-30 00:00:00.000Z"');
    expect(source).toContain('record.getString("status") !== ""');
    expect(source).toContain('record.set("status", "completed")');
  });

  it("restores the blank legacy status on rollback", () => {
    const source = read("pb_migrations/202607210003_normalize_legacy_agm_event_status.js");
    expect(source).toContain('record.getString("status") !== "completed"');
    expect(source).toContain('record.set("status", "")');
  });
});
