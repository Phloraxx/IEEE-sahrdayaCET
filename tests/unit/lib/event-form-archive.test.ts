import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("historical event editing", () => {
  it("does not force existing event dates to be in the future", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/features/admin/events/event-form.tsx"),
      "utf8",
    );
    expect(source).toMatch(
      /min=\{isEdit \? undefined : new Date\(\)\.toISOString\(\)\.slice\(0, 16\)\}/,
    );
  });

  it("validates the required venue before submitting to PocketBase", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/features/admin/events/event-form.tsx"),
      "utf8",
    );
    expect(source).toContain('if (!form.venue.trim())');
    expect(source).toContain('setSubmitError("Please enter a venue")');
    expect(source).toContain('venue: form.venue.trim()');
    expect(source).toContain('<Label htmlFor="evt-venue">Venue *</Label>');
  });
});
