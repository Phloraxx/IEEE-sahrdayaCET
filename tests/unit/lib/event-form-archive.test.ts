import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = () => readFileSync(
  resolve(process.cwd(), "src/features/admin/events/event-form.tsx"),
  "utf8",
);

describe("historical event editing", () => {
  it("does not force existing event dates to be in the future", () => {
    const form = source();
    expect(form).toContain('min={form.timeTbc ? toAppDateOnly(new Date().toISOString()) : toAppDateTimeLocal(new Date().toISOString())}');
    expect(form).toContain('if (!isEdit && (form.timeTbc ? form.date < toAppDateOnly(new Date().toISOString()) : eventStartTimestamp(form) < Date.now() - 300000)');
    expect(form).toContain('<Input id="evt-date" type={form.timeTbc ? "date" : "datetime-local"} value={form.date}');
    expect(form).not.toContain('<Input id="evt-date" type={form.timeTbc ? "date" : "datetime-local"} min=');
  });

  it("requires physical venue only for on-site and hybrid events", () => {
    const form = source();
    expect(form).toContain('form.attendanceMode !== "online" && !form.venue.trim()');
    expect(form).toContain('return ["details", "Enter the event venue."] as const');
    expect(form).toContain('venue: form.attendanceMode === "online" ? "" : form.venue.trim()');
    expect(form).toContain('form.attendanceMode !== "online" && <><div className="grid gap-2"><Label htmlFor="evt-venue">Venue *</Label>');
  });
});
