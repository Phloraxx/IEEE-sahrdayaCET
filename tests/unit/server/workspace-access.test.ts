import { describe, expect, it } from "vitest";

import { hasWorkspaceAccess, type Assignment } from "../../../src/server/authz/capabilities";

function assignment(overrides: Partial<Assignment> = {}): Assignment {
	return {
		id: "a1",
		userId: "u1",
		roleCode: "society_chair",
		scopeType: "society",
		societyId: "s1",
		eventId: null,
		active: true,
		startsAt: null,
		endsAt: null,
		source: null,
		...overrides,
	};
}

describe("workspace access", () => {
	it("admits an admin, a legacy chair and a content editor", () => {
		expect(hasWorkspaceAccess({ id: "u", role: "admin" })).toBe(true);
		expect(hasWorkspaceAccess({ id: "u", role: "chair" })).toBe(true);
		expect(hasWorkspaceAccess({ id: "u", role: "content" })).toBe(true);
	});

	it("rejects an ordinary member and an anonymous caller", () => {
		expect(hasWorkspaceAccess({ id: "u", role: "user" })).toBe(false);
		expect(
			hasWorkspaceAccess({ id: "u", role: "user" }, [assignment({ roleCode: "not_a_role" })]),
		).toBe(false);
		expect(hasWorkspaceAccess(null)).toBe(false);
	});

	it("admits a member with an active workspace assignment", () => {
		expect(
			hasWorkspaceAccess({ id: "u", role: "user" }, [assignment({ roleCode: "event_lead" })]),
		).toBe(true);
	});

	it("does not admit an expired or disabled assignment", () => {
		const past = new Date(Date.now() - 86_400_000).toISOString();
		expect(
			hasWorkspaceAccess({ id: "u", role: "user" }, [assignment({ endsAt: past })]),
		).toBe(false);
		expect(
			hasWorkspaceAccess({ id: "u", role: "user" }, [assignment({ active: false })]),
		).toBe(false);
	});
});
