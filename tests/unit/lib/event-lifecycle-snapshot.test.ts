import { describe, expect, it } from "vitest";
import { getEventLifecycleSnapshot } from "@/lib/event-lifecycle-snapshot";

const NOW = new Date("2026-09-01T06:00:00.000Z").getTime();
const published = {
  status: "published",
  date: "2026-09-02T09:00:00.000Z",
  endDate: "2026-09-02T11:00:00.000Z",
  registrationMode: "internal",
  registrationOpen: true,
  maxCapacity: 100,
  registeredCount: 10,
};

describe("event lifecycle snapshot", () => {
  it("projects an upcoming published event and its registration action", () => {
    const snapshot = getEventLifecycleSnapshot(published, NOW);
    expect(snapshot.phase).toBe("upcoming");
    expect(snapshot.eventDay).toBe("upcoming");
    expect(snapshot.nextAction).toBe("event_operations");
    expect(snapshot.registration).toMatchObject({ mode: "internal", available: true, kind: "open" });
  });

  it("uses the same deadline boundary as public registration eligibility", () => {
    const deadline = new Date(NOW).toISOString();
    const snapshot = getEventLifecycleSnapshot({ ...published, registrationDeadline: deadline }, NOW);
    expect(snapshot.registration.kind).toBe("closed");
    expect(snapshot.registration.available).toBe(false);
  });

  it("projects scheduled registration before its opening time", () => {
    const snapshot = getEventLifecycleSnapshot({
      ...published,
      registrationStart: "2026-09-01T08:00:00.000Z",
    }, NOW);
    expect(snapshot.registration.kind).toBe("opening-soon");
    expect(snapshot.registration.available).toBe(false);
    expect(snapshot.nextAction).toBe("registration_scheduled");
  });

  it("projects a live event from effective start and end", () => {
    const snapshot = getEventLifecycleSnapshot({
      ...published,
      date: "2026-09-01T05:00:00.000Z",
      endDate: "2026-09-01T08:00:00.000Z",
    }, NOW);
    expect(snapshot.phase).toBe("live");
    expect(snapshot.eventDay).toBe("live");
  });

  it("projects an ended published event into completion work", () => {
    const snapshot = getEventLifecycleSnapshot({
      ...published,
      date: "2026-08-31T05:00:00.000Z",
      endDate: "2026-08-31T08:00:00.000Z",
    }, NOW);
    expect(snapshot.phase).toBe("ended");
    expect(snapshot.eventDay).toBe("ended");
    expect(snapshot.nextAction).toBe("complete_event");
    expect(snapshot.registration.available).toBe(false);
  });

  it("keeps a draft actionable without organization or finance approval state", () => {
    const draft = getEventLifecycleSnapshot({
      status: "draft", date: published.date, registrationOpen: false,
    });
    expect(draft.phase).toBe("draft");
    expect(draft.nextAction).toBe("complete_setup");
    expect(draft.blockers).toEqual([]);

    const archived = getEventLifecycleSnapshot({ ...published, isDeleted: true }, NOW);
    expect(archived.phase).toBe("archived");
    expect(archived.nextAction).toBe("none");
  });
});
