import { describe, expect, it } from "vitest";
import {
  getEventAttendanceKind,
  getEventLifecycle,
  getSchemaAttendanceMode,
  getSchemaEventStatus,
} from "@/lib/event-presentation";

describe("event presentation", () => {
  it("maps public lifecycle values to schema.org statuses", () => {
    expect(getEventLifecycle("completed")).toBe("completed");
    expect(getEventLifecycle("cancelled")).toBe("cancelled");
    expect(getEventLifecycle("published")).toBe("scheduled");
    expect(getSchemaEventStatus("completed")).toBe(
      "https://schema.org/EventCompleted",
    );
    expect(getSchemaEventStatus("cancelled")).toBe(
      "https://schema.org/EventCancelled",
    );
    expect(getSchemaEventStatus("published")).toBe(
      "https://schema.org/EventScheduled",
    );
  });

  it("recognizes online, hybrid and physical venues", () => {
    expect(getEventAttendanceKind("Google Meet")).toBe("online");
    expect(getEventAttendanceKind("Online via Zoom")).toBe("online");
    expect(getEventAttendanceKind("Hybrid - Auditorium and Google Meet")).toBe(
      "hybrid",
    );
    expect(getEventAttendanceKind("Jasmine Hall")).toBe("offline");
    expect(getSchemaAttendanceMode("Google Meet")).toBe(
      "https://schema.org/OnlineEventAttendanceMode",
    );
    expect(getSchemaAttendanceMode("Jasmine Hall")).toBe(
      "https://schema.org/OfflineEventAttendanceMode",
    );
  });
});
