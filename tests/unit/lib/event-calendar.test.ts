import { describe, expect, it } from "vitest";
import { __eventCalendarTest, eventCalendarIcs } from "@/lib/event-calendar";
import type { SerializableEvent } from "@/server/public/events.server";

const event = (overrides: Partial<SerializableEvent> = {}): SerializableEvent => ({
  id: "evt123",
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T09:00:00.000Z",
  title: "AI, Safety; Workshop",
  slug: "ai-safety-workshop",
  description: "",
  date: "2026-09-10T04:30:00.000Z",
  endDate: "2026-09-10T06:30:00.000Z",
  timeTbc: false,
  venue: "AI Lab; Block A",
  timezone: "Asia/Kolkata",
  attendanceMode: "onsite",
  locationAddress: "Sahrdaya College, Kodakara",
  price: 0,
  isPaid: false,
  bannerUrl: "",
  status: "published",
  registrationOpen: false,
  registrationMode: "closed",
  registrationStart: "",
  registrationDeadline: "",
  maxCapacity: 0,
  registeredCount: 0,
  ...overrides,
});
describe("event calendar", () => {
  it("serializes stable timed events with escaped public fields", () => {
    const ics = eventCalendarIcs(event(), "https://ieeesahrdaya.com/events/ai-safety-workshop");
    expect(ics).toContain("UID:event-evt123@ieeesahrdaya.com");
    expect(ics).toContain("DTSTART:20260910T043000Z");
    expect(ics).toContain("DTEND:20260910T063000Z");
    expect(ics).toContain("SUMMARY:AI\\, Safety\\; Workshop");
    expect(ics).toContain("LOCATION:AI Lab\\; Block A\\, Sahrdaya College\\, Kodakara");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("URL:https://ieeesahrdaya.com/events/ai-safety-workshop");
  });

  it("uses India calendar dates for time-TBC all-day events", () => {
    const ics = eventCalendarIcs(event({
      date: "2026-09-10T18:30:00.000Z",
      endDate: "",
      timeTbc: true,
    }), "https://ieeesahrdaya.com/events/ai-safety-workshop");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260911");
    expect(ics).toContain("DTEND;VALUE=DATE:20260912");
  });
});

it("folds long UTF-8 calendar lines without exceeding 75 octets", () => {
  const line = `SUMMARY:${"കേരള സാങ്കേതിക ശില്പശാല ".repeat(5)}`;
  const folded = __eventCalendarTest.foldIcsLine(line);
  expect(folded.length).toBeGreaterThan(1);
  for (const part of folded) {
    expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
  }
  expect(folded.slice(1).every((part) => part.startsWith(" "))).toBe(true);
});
