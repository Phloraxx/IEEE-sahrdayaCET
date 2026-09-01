import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type EventLike = { getString: (field: string) => string };
type PrivateDetailsHelpers = {
  safeHttpUrl: (value: unknown) => string;
  attendanceMode: (event: EventLike) => "onsite" | "online" | "hybrid";
};

function loadHelpers(): PrivateDetailsHelpers {
  const source = readFileSync(
    resolve(process.cwd(), "pb_hooks/event-private-details-helpers.js"),
    "utf8",
  );
  const module = { exports: {} as Record<string, unknown> };
  runInNewContext(source, { module, exports: module.exports, Boolean, Error, String });
  return module.exports as PrivateDetailsHelpers;
}

const helpers = loadHelpers();
const event = (values: Record<string, string>): EventLike => ({
  getString: (field) => values[field] ?? "",
});

describe("private event detail helpers", () => {
  it("accepts only trimmed HTTP(S) join URLs", () => {
    expect(helpers.safeHttpUrl(" https://meet.example.test/room ")).toBe("https://meet.example.test/room");
    expect(helpers.safeHttpUrl("http://localhost:3000/room")).toBe("http://localhost:3000/room");
    expect(helpers.safeHttpUrl("")).toBe("");
    expect(() => helpers.safeHttpUrl("javascript:alert(1)")).toThrow("INVALID_JOIN_URL");
    expect(() => helpers.safeHttpUrl("ftp://example.test/room")).toThrow("INVALID_JOIN_URL");
  });

  it("prefers explicit attendance mode and preserves legacy venue inference", () => {
    expect(helpers.attendanceMode(event({ attendanceMode: "hybrid", venue: "Main Hall" }))).toBe("hybrid");
    expect(helpers.attendanceMode(event({ venue: "Google Meet" }))).toBe("online");
    expect(helpers.attendanceMode(event({ venue: "Hybrid - AI Lab + Zoom" }))).toBe("hybrid");
    expect(helpers.attendanceMode(event({ venue: "AI Lab" }))).toBe("onsite");
  });
});
