import { describe, expect, it } from "vitest";
import { getEventAvailability } from "@/lib/event-availability";

const NOW = new Date("2026-08-16T12:00:00.000Z").getTime();
const base = {
  status: "published",
  date: "2026-08-20T10:00:00.000Z",
  registrationOpen: true,
  registrationMode: "internal",
  maxCapacity: 100,
  registeredCount: 0,
};

describe("public event availability language", () => {
  it.each([
    [0, "Open"],
    [49, "Open"],
    [50, "Filling"],
    [69, "Filling"],
    [70, "Filling fast"],
    [89, "Filling fast"],
    [90, "Few places left"],
    [99, "Few places left"],
    [100, "Full"],
  ])("maps %s registrations to %s", (registeredCount, label) => {
    expect(getEventAvailability({ ...base, registeredCount }, NOW).label).toBe(label);
  });

  it("shows opening soon before the registration window", () => {
    expect(getEventAvailability({ ...base, registrationStart: "2026-08-17T12:00:00.000Z", registrationOpen: false }, NOW).label).toBe("Opening soon");
  });

  it("does not call a manually closed registration opening soon", () => {
    expect(getEventAvailability({ ...base, registrationMode: "closed", registrationStart: "2026-08-17T12:00:00.000Z", registrationOpen: false }, NOW).label).toBe("Closed");
  });

  it("lets a near deadline override fill language", () => {
    expect(getEventAvailability({ ...base, registeredCount: 80, registrationDeadline: "2026-08-17T06:00:00.000Z" }, NOW).label).toBe("Closing soon");
  });

  it("keeps full as the highest-priority public signal", () => {
    expect(getEventAvailability({ ...base, registeredCount: 100, registrationDeadline: "2026-08-17T06:00:00.000Z" }, NOW).label).toBe("Full");
  });

  it("shows closed after the deadline or when registration is disabled", () => {
    expect(getEventAvailability({ ...base, registrationDeadline: "2026-08-16T11:00:00.000Z" }, NOW).label).toBe("Closed");
    expect(getEventAvailability({ ...base, registrationOpen: false, registrationMode: "closed" }, NOW).label).toBe("Closed");
  });

  it("counts active waitlist offers as occupied public capacity", () => {
    expect(getEventAvailability({ ...base, registeredCount: 99, waitlistReservedCount: 1 }, NOW).label).toBe("Full");
    expect(getEventAvailability({ ...base, registeredCount: 89, waitlistReservedCount: 1 }, NOW).label).toBe("Few places left");
  });

  it("supports events without a public capacity", () => {
    expect(getEventAvailability({ ...base, maxCapacity: 0 }, NOW).label).toBe("Open");
  });
});
