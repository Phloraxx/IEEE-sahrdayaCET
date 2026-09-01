import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type AttendanceHelpers = {
  nextCreditState: (current: boolean, type: string) => boolean;
  CREDITING_TYPES: string[];
};

function loadHelpers(): AttendanceHelpers {
  const source = readFileSync(
    resolve(process.cwd(), "pb_hooks/attendance-v2-helpers.js"),
    "utf8",
  );
  const module = { exports: {} as Record<string, unknown> };
  runInNewContext(source, {
    module,
    exports: module.exports,
    Array,
    Boolean,
    Date,
    Math,
    Number,
    Object,
    String,
    isFinite,
  });
  return module.exports as AttendanceHelpers;
}

const helpers = loadHelpers();

describe("Attendance V2 credit state", () => {
  it("treats scans and manual adds as presence credit", () => {
    expect(helpers.CREDITING_TYPES).toEqual(["present", "entry", "manual_add"]);
    expect(helpers.nextCreditState(false, "present")).toBe(true);
    expect(helpers.nextCreditState(false, "entry")).toBe(true);
    expect(helpers.nextCreditState(false, "manual_add")).toBe(true);
  });

  it("uses append-only corrections to remove and restore presence", () => {
    let present = helpers.nextCreditState(false, "present");
    present = helpers.nextCreditState(present, "manual_remove");
    expect(present).toBe(false);
    present = helpers.nextCreditState(present, "manual_add");
    expect(present).toBe(true);
  });

  it("does not invent a state transition for unknown historical event types", () => {
    expect(helpers.nextCreditState(true, "exit")).toBe(true);
    expect(helpers.nextCreditState(false, "exit")).toBe(false);
  });
});
