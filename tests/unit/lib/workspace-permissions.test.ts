import { describe, expect, it } from "vitest";
import {
  canAccessWorkspacePath,
  hasScopedWorkspaceCapability,
  hasWorkspaceCapability,
  preferredWorkspacePath,
  type WorkspaceAssignment,
  type WorkspaceMe,
} from "@/lib/workspace-permissions";

function assignment(overrides: Partial<WorkspaceAssignment> = {}): WorkspaceAssignment {
  return {
    id: "a1", userId: "u1", roleCode: "event_checkin", title: "Check-in Staff",
    scopeType: "event", societyId: "", eventId: "event-a", term: "",
    startsAt: "", endsAt: "", active: true, source: "manual", notes: "",
    capabilities: ["workspace.view", "events.view", "checkin.manage"],
    ...overrides,
  };
}

function workspace(assignments: WorkspaceAssignment[], branchCapabilities: WorkspaceMe["branchCapabilities"] = []): WorkspaceMe {
  const capabilities = [...new Set([...branchCapabilities, ...assignments.flatMap((row) => row.capabilities)])];
  return { hasWorkspace: capabilities.length > 0, legacyRole: "user", capabilities, branchCapabilities, assignments };
}
describe("workspace scoped permissions", () => {
  it("requires an exact event scope", () => {
    const ws = workspace([assignment()]);
    expect(hasWorkspaceCapability(ws, "checkin.manage")).toBe(true);
    expect(hasScopedWorkspaceCapability(ws, "checkin.manage", { eventId: "event-a" })).toBe(true);
    expect(hasScopedWorkspaceCapability(ws, "checkin.manage", { eventId: "event-b" })).toBe(false);
    expect(hasScopedWorkspaceCapability(ws, "registrations.view", { eventId: "event-a" })).toBe(false);
  });

  it("requires an exact society scope and ignores inactive assignments", () => {
    const society = assignment({
      id: "s1", roleCode: "society_content", scopeType: "society", societyId: "society-a", eventId: "",
      capabilities: ["workspace.view", "societies.view", "content.manage"],
    });
    const inactive = assignment({ id: "off", active: false, eventId: "event-b" });
    const ws = workspace([society, inactive]);
    expect(hasScopedWorkspaceCapability(ws, "content.manage", { societyId: "society-a" })).toBe(true);
    expect(hasScopedWorkspaceCapability(ws, "content.manage", { societyId: "society-b" })).toBe(false);
    expect(hasScopedWorkspaceCapability(ws, "checkin.manage", { eventId: "event-b" })).toBe(false);
  });
  it("lets branch capabilities apply across scopes", () => {
    const ws = workspace([], ["workspace.view", "finance.view", "reports.view"]);
    expect(hasWorkspaceCapability(ws, "finance.view")).toBe(true);
    expect(hasScopedWorkspaceCapability(ws, "finance.view", { eventId: "event-any" })).toBe(true);
    expect(hasScopedWorkspaceCapability(ws, "reports.view", { societyId: "society-any" })).toBe(true);
  });

  it("blocks direct navigation to surfaces outside the role", () => {
    const checkin = workspace([assignment()]);
    expect(canAccessWorkspacePath(checkin, "/admin/check-in")).toBe(true);
    expect(canAccessWorkspacePath(checkin, "/admin/registrations")).toBe(false);
    expect(canAccessWorkspacePath(checkin, "/admin/payments")).toBe(false);
    expect(canAccessWorkspacePath(checkin, "/admin/access")).toBe(false);

    const branchFinance = workspace([], ["workspace.view", "events.view", "finance.view"]);
    expect(canAccessWorkspacePath(branchFinance, "/admin/payments")).toBe(true);
    expect(canAccessWorkspacePath(branchFinance, "/admin/registrations")).toBe(false);
    expect(canAccessWorkspacePath(branchFinance, "/admin/registrations/registration-a")).toBe(true);
    expect(canAccessWorkspacePath(branchFinance, "/admin/data-health")).toBe(false);
  });

  it("chooses useful narrow-role landing pages", () => {
    const checkin = workspace([assignment()]);
    expect(preferredWorkspacePath(checkin)).toBe("/admin/check-in");

    const content = workspace([assignment({
      roleCode: "event_content", eventId: "event-a",
      capabilities: ["workspace.view", "events.view", "content.manage"],
    })]);
    expect(preferredWorkspacePath(content)).toBe("/admin/blogs");

    const branchFinance = workspace([], ["workspace.view", "events.view", "finance.view"]);
    expect(preferredWorkspacePath(branchFinance)).toBe("/admin/payments");
  });
});
