import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/audit", () => ({ audit: vi.fn() }));

import { collectionAuditInput } from "@/server/collections/audit";

/**
 * The generic collection surface is how the admin UI saves societies, execom
 * members, events and coupons. Each write must leave one audit row with a
 * readable action and only the useful part of the row.
 */
describe("collection audit rows", () => {
	it("records a create with the row as its after image", () => {
		const input = collectionAuditInput({
			actorId: "user-1",
			collection: "societies",
			kind: "create",
			row: { id: "soc-1", name: "Computer Society", slug: "cs", is_hidden: 0 },
		});

		expect(input.action).toBe("society.create");
		expect(input.entityType).toBe("society");
		expect(input.entityId).toBe("soc-1");
		expect(input.actorId).toBe("user-1");
		expect(input.before).toBeUndefined();
		expect(input.after).toEqual({ id: "soc-1", name: "Computer Society", slug: "cs", is_hidden: 0 });
		expect(input.eventId).toBeNull();
		expect(input.registrationId).toBeNull();
	});

	it("records only the changed columns of an update and links the event", () => {
		const input = collectionAuditInput({
			actorId: "user-1",
			collection: "events",
			kind: "update",
			row: { id: "evt-1", title: "New title", venue: "Hall", event_id: "evt-1" },
			before: { id: "evt-1", title: "Old title", venue: "Hall", event_id: "evt-1" },
			changed: ["title"],
		});

		expect(input.action).toBe("event.update");
		expect(input.eventId).toBe("evt-1");
		expect(input.note).toBe("Updated title");
		expect(input.before).toEqual({ title: "Old title" });
		expect(input.after).toEqual({ title: "New title" });
	});

	it("links a certificate to its event and registration", () => {
		const input = collectionAuditInput({
			actorId: "user-1",
			collection: "certificates",
			kind: "delete",
			row: { id: "cert-1", credential_id: "IEEE-1", event_id: "evt-1", registration_id: "reg-1" },
		});

		expect(input.action).toBe("certificate.delete");
		expect(input.eventId).toBe("evt-1");
		expect(input.registrationId).toBe("reg-1");
		expect(input.after).toBeUndefined();
		expect(input.before).toMatchObject({ id: "cert-1", credential_id: "IEEE-1" });
	});

	it("does not copy a person's Google subject into the log", () => {
		const input = collectionAuditInput({
			actorId: "admin-1",
			collection: "users",
			kind: "delete",
			row: { id: "user-2", email: "person@example.com", google_sub: "1234567890" },
		});

		expect(input.action).toBe("user.delete");
		// Both identifying values are redacted: the audit feed is readable by
		// every scoped `reports.view` holder, and a deletion is explained by who
		// and which row, not by the address.
		expect(input.before).toMatchObject({ email: "[redacted]", google_sub: "[redacted]" });
	});

	it("does not copy a recipient address into the log", () => {
		const input = collectionAuditInput({
			actorId: "admin-1",
			collection: "notification_outbox",
			kind: "update",
			row: { id: "out-1", recipient: "person@example.com", status: "sent" },
			before: { id: "out-1", recipient: "person@example.com", status: "pending" },
			changed: ["status"],
		});

		expect(input.after).toEqual({ status: "sent" });
		expect(input.note).toBe("Updated status");
	});

	it("marks an opaque answer set rather than storing the answers", () => {
		const input = collectionAuditInput({
			actorId: "admin-1",
			collection: "community_profiles",
			kind: "update",
			row: { id: "p1", department: "CSE", form_responses: '{"name":"A Person"}' },
			before: { id: "p1", department: "CSE", form_responses: '{"name":"A Person"}' },
			changed: ["department", "form_responses"],
		});

		expect(input.before).toEqual({ department: "CSE", form_responses: "[opaque]" });
		expect(input.after).toEqual({ department: "CSE", form_responses: "[opaque]" });
	});

	it("keeps the event id on an event create", () => {
		const input = collectionAuditInput({
			actorId: "admin-1",
			collection: "events",
			kind: "create",
			row: { id: "evt-2", title: "Workshop", status: "draft" },
		});

		expect(input.eventId).toBe("evt-2");
		expect(input.entityId).toBe("evt-2");
	});
});
