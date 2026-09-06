import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  MAX_EVENT_REQUIREMENT_LENGTH,
  MAX_EVENT_REQUIREMENTS,
  memberPrice,
  normalizeEventRequirements,
  validateEventRequirements,
} from "@/lib/event-requirements";

type ServerHelpers = {
  normalizeRequirements: (value: unknown) => { ok: boolean; requirements?: string[]; error?: string };
  normalizeAttendeeNote: (value: unknown) => { ok: boolean; note?: string; error?: string };
};

function loadServerHelpers(): ServerHelpers {
  const source = readFileSync(resolve(process.cwd(), "pb_hooks/event-requirements-helpers.js"), "utf8");
  const module = { exports: {} as Record<string, unknown> };
  runInNewContext(source, { module, exports: module.exports, Array, Boolean, Error, JSON, Number, String, isFinite });
  return module.exports as ServerHelpers;
}

const server = loadServerHelpers();

describe("event requirements", () => {
  it("normalizes public reads without trusting malformed values", () => {
    expect(normalizeEventRequirements(["  Bring charger  ", "", 42, "College ID"])).toEqual(["Bring charger", "College ID"]);
    expect(normalizeEventRequirements("not-an-array")).toEqual([]);
  });

  it("enforces the editor contract before save", () => {
    expect(validateEventRequirements(Array.from({ length: MAX_EVENT_REQUIREMENTS + 1 }, (_, i) => `Item ${i}`))).toContain("at most");
    expect(validateEventRequirements(["x".repeat(MAX_EVENT_REQUIREMENT_LENGTH + 1)])).toContain("characters or fewer");
    expect(validateEventRequirements(["  Laptop  ", ""])).toBeNull();
  });

  it("enforces the same contract at the PocketBase boundary", () => {
    expect(server.normalizeRequirements(["  Bring charger  ", "", "College ID"])).toMatchObject({ ok: true, requirements: ["Bring charger", "College ID"] });
    expect(server.normalizeRequirements(Array.from({ length: 13 }, (_, i) => `Item ${i}`))).toMatchObject({ ok: false });
    expect(server.normalizeRequirements(["x".repeat(201)])).toMatchObject({ ok: false });
    expect(server.normalizeRequirements([{ unsafe: true }])).toMatchObject({ ok: false });
    expect(server.normalizeAttendeeNote("  Report early.  ")).toMatchObject({ ok: true, note: "Report early." });
  });

  it("calculates the public IEEE member price in paise-safe arithmetic", () => {
    expect(memberPrice(200, 20)).toBe(160);
    expect(memberPrice(125.5, 10)).toBe(112.95);
    expect(memberPrice(75, 100)).toBe(0);
  });
});
