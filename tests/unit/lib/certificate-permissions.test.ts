import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { WORKSPACE_CAPABILITIES } from "@/lib/workspace-permissions";

const source = readFileSync(resolve(process.cwd(), "pb_hooks/workspace-authorization.js"), "utf8");
const sandbox = { module: { exports: {} as Record<string, unknown> }, exports: {} };
vm.runInNewContext(source, sandbox, { filename: "workspace-authorization.js" });
const auth = sandbox.module.exports as {
  ROLE_CAPABILITIES: Record<string, string[]>;
  ALL_CAPABILITIES: string[];
};

const certificateCapabilities = [
  "certificates.view",
  "certificates.manage_templates",
  "certificates.issue",
  "certificates.send",
  "certificates.revoke",
];

describe("certificate permissions", () => {
  it("publishes the same certificate capability vocabulary to the browser", () => {
    for (const capability of certificateCapabilities) {
      expect(WORKSPACE_CAPABILITIES).toContain(capability);
      expect(auth.ALL_CAPABILITIES).toContain(capability);
    }
  });

  it("does not grant issue authority to registration or check-in staff", () => {
    expect(auth.ROLE_CAPABILITIES.event_registration).not.toContain("certificates.issue");
    expect(auth.ROLE_CAPABILITIES.event_checkin).not.toContain("certificates.issue");
    expect(auth.ROLE_CAPABILITIES.event_content).not.toContain("certificates.issue");
    expect(auth.ROLE_CAPABILITIES.event_finance).not.toContain("certificates.issue");
  });

  it("lets an event lead view and issue but not change templates or revoke", () => {
    expect(auth.ROLE_CAPABILITIES.event_lead).toContain("certificates.view");
    expect(auth.ROLE_CAPABILITIES.event_lead).toContain("certificates.issue");
    expect(auth.ROLE_CAPABILITIES.event_lead).toContain("certificates.send");
    expect(auth.ROLE_CAPABILITIES.event_lead).not.toContain("certificates.manage_templates");
    expect(auth.ROLE_CAPABILITIES.event_lead).not.toContain("certificates.revoke");
  });

  it("gives society chairs and faculty full scoped certificate authority", () => {
    for (const role of ["society_chair", "society_faculty"]) {
      for (const capability of certificateCapabilities) {
        expect(auth.ROLE_CAPABILITIES[role]).toContain(capability);
      }
    }
  });

  it("keeps Send explicit but aligned with ordinary issue authority", () => {
    for (const role of ["branch_secretary", "branch_joint_secretary", "society_secretary", "event_lead"]) {
      expect(auth.ROLE_CAPABILITIES[role]).toContain("certificates.issue");
      expect(auth.ROLE_CAPABILITIES[role]).toContain("certificates.send");
    }
    for (const role of ["event_registration", "event_checkin", "event_content", "event_finance"]) {
      expect(auth.ROLE_CAPABILITIES[role]).not.toContain("certificates.send");
    }
  });

  it("keeps revocation narrower than ordinary issue authority", () => {
    expect(auth.ROLE_CAPABILITIES.branch_secretary).toContain("certificates.issue");
    expect(auth.ROLE_CAPABILITIES.branch_secretary).not.toContain("certificates.revoke");
    expect(auth.ROLE_CAPABILITIES.society_secretary).toContain("certificates.issue");
    expect(auth.ROLE_CAPABILITIES.society_secretary).not.toContain("certificates.revoke");
  });
});
