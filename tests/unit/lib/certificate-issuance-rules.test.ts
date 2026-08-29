import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

type Rules = {
  normalizeAudienceConfig: (type: string, input: unknown) => { registrationIds?: string[] };
  audienceInputErrors: (type: string, config: { registrationIds?: string[] }) => string[];
  validEmail: (value: unknown) => boolean;
  fingerprintPayload: (input: Record<string, unknown>) => Record<string, unknown>;
};

function loadRules(): Rules {
  const source = readFileSync(resolve(process.cwd(), "pb_hooks/certificate-issuance-rules.js"), "utf8");
  const sandbox = { module: { exports: {} as Rules }, exports: {} };
  vm.runInNewContext(source, sandbox, { filename: "certificate-issuance-rules.js" });
  return sandbox.module.exports;
}

const rules = loadRules();

describe("certificate issuance audience rules", () => {
  it("canonicalizes selected registration IDs for deterministic review", () => {
    expect(rules.normalizeAudienceConfig("selected", { registrationIds: ["b", "a", "b", ""] })).toEqual({ registrationIds: ["a", "b"] });
  });

  it("keeps attendance-qualified audiences unavailable until sessions exist", () => {
    const errors = rules.audienceInputErrors("attendance_qualified", {});
    expect(errors.join(" ")).toMatch(/attendance sessions/i);
  });

  it("requires an explicit non-empty selected audience", () => {
    expect(rules.audienceInputErrors("selected", { registrationIds: [] })).toContain("Select at least one registration");
  });

  it("treats missing email as delivery-ineligible without invalidating issuance", () => {
    expect(rules.validEmail("person@example.com")).toBe(true);
    expect(rules.validEmail("")).toBe(false);
    expect(rules.validEmail("not-an-email")).toBe(false);
  });

  it("fingerprints the exact recipient snapshots, not just registration IDs", () => {
    const payload = rules.fingerprintPayload({
      eventId: "event1",
      templateId: "template1",
      templateContentHash: "hash1",
      certificateType: "completion",
      audienceType: "selected",
      audienceConfig: { registrationIds: ["reg2", "reg1"] },
      recipients: [{ id: "reg1", name: "Alice", email: "a@example.com" }],
    });
    expect(payload).toMatchObject({ audienceConfig: { registrationIds: ["reg1", "reg2"] } });
    expect(payload.recipients).toEqual([{ id: "reg1", name: "Alice", email: "a@example.com" }]);
  });
});
