import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("event ownership architecture", () => {
  it("keeps host-society transfers admin-only", () => {
    const source = readFileSync(resolve(process.cwd(), "pb_hooks/events.pb.js"), "utf8");
    expect(source).toContain('role === "chair"');
    expect(source).toContain('newRecord.getString("society") !== oldRecord.getString("society")');
    expect(source).toContain("transfer an event to another society");
  });
});
