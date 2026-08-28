import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("historical event editing", () => {
  it("does not force existing event dates to be in the future", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/features/admin/events/event-form.tsx"),
      "utf8",
    );
    expect(source).toContain('min={form.timeTbc ? toAppDateOnly(new Date().toISOString()) : toAppDateTimeLocal(new Date().toISOString())}');
    expect(source).toContain('if (!isEdit && (form.timeTbc ? form.date < toAppDateOnly(new Date().toISOString()) : eventStartTimestamp(form) < Date.now() - 300000)');
    expect(source).toContain('<Input id="evt-date" type={form.timeTbc ? "date" : "datetime-local"} value={form.date}');
    expect(source).not.toContain('<Input id="evt-date" type={form.timeTbc ? "date" : "datetime-local"} min=');
  });

  it("validates the required venue before submitting to PocketBase", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/features/admin/events/event-form.tsx"),
      "utf8",
    );
    expect(source).toContain('if (!form.venue.trim())');
    expect(source).toContain('return ["details", "Enter the event venue."] as const');
    expect(source).toContain('venue: form.venue.trim()');
    expect(source).toContain('<Label htmlFor="evt-venue">Venue *</Label>');
  });
});
