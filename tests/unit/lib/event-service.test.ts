import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("event archive architecture", () => {
  it("archives through an explicit command without rewriting the event outcome", () => {
    const client = read("src/lib/data/admin-events.client.ts");
    const hook = read("pb_hooks/event-archive.pb.js");
    expect(client).toContain('/api/admin/events/${encodeURIComponent(id)}/archive');
    expect(client).toContain("archiveAdminEvent");
    expect(hook).toContain('current.set("isDeleted", true)');
    expect(hook).toContain('current.set("registrationOpen", false)');
    expect(hook).not.toContain('current.set("status", "cancelled")');
  });

  it("separates archive permission from cancellation and removes the old soft-delete helper", () => {
    const auth = read("pb_hooks/workspace-authorization.js");
    const guard = read("pb_hooks/events.pb.js");
    expect(auth).toContain('"events.archive"');
    expect(guard).toContain("Use the Archive event command");
    expect(existsSync(resolve(process.cwd(), "src/lib/event-service.ts"))).toBe(false);
    const listUi = read("src/routes/admin.events.index.tsx");
    expect(listUi).toContain("hasScopedWorkspaceCapability");
    expect(listUi).toContain('"events.archive", { eventId: event.id, societyId: event.societyId }');
    expect(listUi).toContain("canArchiveEvent(event)");
  });
});
