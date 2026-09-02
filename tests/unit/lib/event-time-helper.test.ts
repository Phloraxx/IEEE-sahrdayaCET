import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

function loadHelper() {
  const source = readFileSync(resolve(process.cwd(), "pb_hooks/event-time-helpers.js"), "utf8");
  const module = { exports: {} as { eventEndDate?: (event: any) => Date | null } };
  vm.runInNewContext(source, { module, exports: module.exports, Date, isNaN });
  if (!module.exports.eventEndDate) throw new Error("eventEndDate was not exported");
  return module.exports.eventEndDate;
}

function event(date: string, endDate = "", timeTbc = false) {
  return {
    getString: (key: string) => key === "date" ? date : key === "endDate" ? endDate : "",
    getBool: (key: string) => key === "timeTbc" && timeTbc,
  };
}

describe("PocketBase event time helper", () => {
  it("keeps a date-only IST event active until the next IST midnight", () => {
    const end = loadHelper()(event("2026-08-28T18:30:00.000Z", "", true));
    expect(end?.toISOString()).toBe("2026-08-29T18:30:00.000Z");
  });

  it("prefers an explicit end and preserves exact-time legacy semantics", () => {
    const helper = loadHelper();
    expect(helper(event("2026-08-28T18:30:00.000Z"))?.toISOString()).toBe("2026-08-28T18:30:00.000Z");
    expect(helper(event("2026-08-28T18:30:00.000Z", "2026-08-30T10:00:00.000Z", true))?.toISOString()).toBe("2026-08-30T10:00:00.000Z");
  });
  it("keeps event completion bound to the shared effective end", () => {
    const workflow = readFileSync(resolve(process.cwd(), "pb_hooks/workspace.pb.js"), "utf8");
    expect(workflow).toContain('event-time-helpers.js');
    expect(workflow).toContain('.eventEndDate(event)');
    expect(workflow).toContain('"EVENT_NOT_ENDED"');
    expect(workflow).not.toContain('"EVENT_NOT_STARTED"');
  });

});
